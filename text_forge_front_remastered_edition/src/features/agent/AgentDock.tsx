'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, X, Pin, PinOff, Send, CircleStop } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useBookDetailStore } from '@/app/(dashboard)/books/[id]/store';
import { useAgentSender } from './useAgentSender';
import { performUnlockAndRetry } from '@/app/(dashboard)/books/[id]/AgentPanel/useAgentReview';
import { useManuscriptStore } from '@/app/manuscript/book/[bookId]/store';
import * as contentsApi from '@/shared/api/contents';
import type { Character } from '@/shared/api/types';
import { WriteReviewCard } from '../../app/manuscript/book/[bookId]/WriteReviewCard';

type SelectionDetail = { text: string; mode: string };

const AGENT_POS_KEY = 'tf_agent_pos';

/**
 * 组装「接管本章」的生成提示：把当前章节大纲/摘要、相关角色，以及上一章正文
 * （若存在）一并注入，使 Agent 在生成正文时有明确的上文与设定依据。
 */
const buildWritePrompt = async (chapterId: number): Promise<string> => {
  const ms = useManuscriptStore.getState();
  const tree = ms.chapters;
  const idx = tree.findIndex((c) => c.chapterId === chapterId && c.type === 'chapter');
  const chapterTitle = ms.activeChapterTitle || tree[idx]?.title || `第 ${chapterId} 章`;

  // 当前章节的摘要与关联角色
  let summary = '';
  let characterIds: number[] = [];
  for (const v of ms.volumes) {
    const ch = v.chapters.find((c) => c.id === chapterId);
    if (ch) {
      summary = ch.summary || '';
      characterIds = ch.characterIds || [];
      break;
    }
  }

  const relevantChars = characterIds
    .map((id) => ms.characters.find((c) => c.id === id))
    .filter((c): c is Character => Boolean(c));
  const charsText = relevantChars.length
    ? relevantChars.map((c) => `- ${c.name}：${(c.description || '').slice(0, 100)}`).join('\n')
    : '（无相关角色信息）';

  // 上一章正文（若存在）
  let prevTitle = '';
  let prevContent = '';
  if (idx > 0) {
    const prev = [...tree.slice(0, idx)].reverse().find((c) => c.type === 'chapter');
    if (prev?.chapterId) {
      prevTitle = prev.title;
      try {
        const latest = await contentsApi.fetchLatestContent(prev.chapterId);
        prevContent = latest.content || '';
      } catch {
        prevContent = '';
      }
    }
  }

  const prevText = prevContent.trim()
    ? `## 上一章《${prevTitle}》正文\n${prevContent.trim()}`
    : '## 上一章正文\n（上一章暂无正文，可作为开篇章节撰写）';

  return [
    '# 任务：接手撰写本章正文',
    '',
    `## 本书\n${ms.bookTitle || '（未命名书籍）'}`,
    '',
    `## 本章信息\n- 章节标题：${chapterTitle}\n- 本章大纲/摘要：${summary.trim() || '（无）'}`,
    '',
    `## 本章相关角色\n${charsText}`,
    '',
    prevText,
    '',
    '请基于以上「本章大纲/摘要」「相关角色」与「上一章正文」的上下文，承接剧情、人物、伏笔与文风连贯性，生成本章的完整正文内容。',
    '要求：',
    '- 不要调用任何工具，不要添加任何解释、前缀或后缀；',
    '- 仅返回正文本身；',
    '- 字数控制在 3000-5000 字。',
  ].join('\n');
};

const MODE_LABEL: Record<string, string> = {
  polish: '润色',
  expand: '扩写',
  rewrite: '改写',
  summarize: '摘要',
  alternatives: '替代表达',
  grammar: '语法',
  consistency: '一致性',
};

const transformPrompt = (text: string, mode: string) =>
  `请对下面的文本进行「${MODE_LABEL[mode] || mode}」处理，不要调用任何工具，也不要添加任何解释或前缀，仅返回处理后的文本本身：\n\n${text}`;
const reviewPrompt = (text: string, mode: string) =>
  `请检查下面文本的「${MODE_LABEL[mode] || mode}」问题，并直接给出修正后的完整文本，不要调用任何工具，不要添加解释或前缀，仅返回修正后的文本本身：\n\n${text}`;

/**
 * 手稿页 Agent：贴边可拖拽头像（地图页玻璃风格），默认贴边、悬停展开聊天面板，支持对话与章节写入审核。
 * 头像可拖动以调整位置，避免遮挡视野；接管/写入等事件仍由此承接并触发面板。
 */
export function AgentDock() {
  const { sendMessage, abort, messagesEndRef } = useAgentSender();
  const agentMessages = useBookDetailStore((s) => s.agentMessages);
  const agentStreaming = useBookDetailStore((s) => s.agentStreaming);
  const bookId = useBookDetailStore((s) => s.bookId);

  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);

  // 初始位置延迟到挂载后读取（避免 SSR/CSR 因 window 分支产生 hydration mismatch）：
  // 服务端与客户端的首次渲染都返回 null（不渲染按钮），挂载后再从 localStorage 或
  // 默认右下角位置赋值，保证两端 HTML 一致。
  // setState 放入微任务，规避 react-hooks/set-state-in-effect 同步 setState 告警
  useEffect(() => {
    let alive = true;
    const read = () => {
      if (!alive) return;
      try {
        const raw = localStorage.getItem(AGENT_POS_KEY);
        if (raw) {
          const p = JSON.parse(raw);
          if (typeof p.x === 'number' && typeof p.y === 'number') {
            setPos(p as { x: number; y: number });
            return;
          }
        }
      } catch { /* ignore */ }
      setPos({ x: window.innerWidth - 56, y: Math.round(window.innerHeight * 0.4) });
    };
    const id = window.setTimeout(read, 0);
    return () => { alive = false; window.clearTimeout(id); };
  }, []);
  const [hovering, setHovering] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [inputText, setInputText] = useState('');
  const [writeReview, setWriteReview] = useState<{ chapterId: number; content: string } | null>(null);
  const [selectionReview, setSelectionReview] = useState<{ start: number; end: number; content: string } | null>(null);

  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const startRef = useRef<{ mx: number; my: number; x: number; y: number } | null>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const captureRef = useRef<{ kind: 'chapter' | 'selection'; chapterId?: number; start?: number; end?: number } | null>(null);
  const wasStreamingRef = useRef(false);

  // 捕获 Agent 结果（整章写入 / 选中文本改写），生成审核卡
  useEffect(() => {
    if (wasStreamingRef.current && !agentStreaming && captureRef.current) {
      const cap = captureRef.current;
      captureRef.current = null;
      const last = [...agentMessages]
        .reverse()
        .find((m) => m.role === 'assistant' && m.content && m.type !== 'review-card' && m.type !== 'propose-cards');
      if (last?.content) {
        const text = last.content.trim();
        if (cap.kind === 'chapter' && cap.chapterId != null) {
          setWriteReview({ chapterId: cap.chapterId, content: text });
        } else if (cap.kind === 'selection' && cap.start != null && cap.end != null) {
          setSelectionReview({ start: cap.start, end: cap.end, content: text });
        }
      }
    }
    wasStreamingRef.current = agentStreaming;
  }, [agentStreaming, agentMessages]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!draggingRef.current || !startRef.current || !pos) return;
      const nx = startRef.current.x + (e.clientX - startRef.current.mx);
      const ny = startRef.current.y + (e.clientY - startRef.current.my);
      if (Math.abs(e.clientX - startRef.current.mx) > 3 || Math.abs(e.clientY - startRef.current.my) > 3) movedRef.current = true;
      setPos({ x: Math.max(0, nx), y: Math.max(0, ny) });
    };
    const onUp = () => {
      if (draggingRef.current) {
        draggingRef.current = false;
        if (!movedRef.current) setPinned((p) => !p);
        movedRef.current = false;
        if (pos) localStorage.setItem(AGENT_POS_KEY, JSON.stringify(pos));
      }
      startRef.current = null;
      document.body.style.cursor = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [pos]);

  useEffect(() => {
    const handleTransform = (e: Event) => {
      const d = (e as CustomEvent).detail as (SelectionDetail & { start?: number; end?: number }) | undefined;
      if (!d || !d.text) return;
      setHovering(true);
      setPinned(true);
      captureRef.current = { kind: 'selection', start: d.start, end: d.end };
      void sendMessage(transformPrompt(d.text, d.mode || 'polish'));
    };
    const handleReview = (e: Event) => {
      const d = (e as CustomEvent).detail as (SelectionDetail & { start?: number; end?: number }) | undefined;
      if (!d || !d.text) return;
      setHovering(true);
      setPinned(true);
      captureRef.current = { kind: 'selection', start: d.start, end: d.end };
      void sendMessage(reviewPrompt(d.text, d.mode || 'grammar'));
    };
    const handleChapter = (e: Event) => {
      const d = (e as CustomEvent).detail as Record<string, unknown> | undefined;
      const chapterId = d?.chapterId as number | undefined;
      if (!chapterId) return;
      setHovering(true);
      void sendMessage(`请调用 read_chapter_content 工具读取本章（chapter_id=${chapterId}），然后基于正文给出续写/修改建议。`);
    };
    const handleChapterWrite = async (e: Event) => {
      const d = (e as CustomEvent).detail as Record<string, unknown> | undefined;
      const chapterId = d?.chapterId as number | undefined;
      if (!chapterId) return;
      setHovering(true);
      setPinned(true);
      captureRef.current = { kind: 'chapter', chapterId };
      const prompt = await buildWritePrompt(chapterId);
      void sendMessage(prompt);
    };
    window.addEventListener('textforge:transform-selection', handleTransform);
    window.addEventListener('textforge:review-selection', handleReview);
    window.addEventListener('textforge:chapter-agent', handleChapter);
    window.addEventListener('textforge:chapter-write', handleChapterWrite);
    return () => {
      window.removeEventListener('textforge:transform-selection', handleTransform);
      window.removeEventListener('textforge:review-selection', handleReview);
      window.removeEventListener('textforge:chapter-agent', handleChapter);
      window.removeEventListener('textforge:chapter-write', handleChapterWrite);
    };
  }, [sendMessage]);

  const expanded = hovering || pinned;

  const enter = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    setHovering(true);
  };
  const leave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    hoverTimerRef.current = setTimeout(() => { if (!pinned) setHovering(false); }, 160);
  };

  const startDrag = (e: React.MouseEvent) => {
    if (!pos) return;
    draggingRef.current = true;
    movedRef.current = false;
    startRef.current = { mx: e.clientX, my: e.clientY, x: pos.x, y: pos.y };
    document.body.style.cursor = 'grabbing';
  };

  const submitInput = () => {
    const text = inputText.trim();
    if (!text || agentStreaming) return;
    setInputText('');
    void sendMessage(text);
  };

  const unlockAndRetry = (retryMessage: string) => {
    void performUnlockAndRetry(bookId, retryMessage, sendMessage);
  };

  if (!pos) return null;

  const panelLeft = pos.x > window.innerWidth / 2 ? pos.x - 340 : pos.x + 52;
  const panelTop = Math.min(pos.y, window.innerHeight - 460);

  const visible = agentMessages.filter(
    (m) => m.role === 'assistant' && (m.content || m.type === 'streaming') && m.type !== 'review-card' && m.type !== 'propose-cards',
  );

  return (
    <>
      <button
        onMouseDown={startDrag}
        onMouseEnter={enter}
        onMouseLeave={leave}
        style={{ position: 'fixed', left: pos.x, top: pos.y, zIndex: 50 }}
        className="flex h-11 w-11 items-center justify-center rounded-2xl bg-card/90 backdrop-blur-sm border border-border/50 shadow-sm text-muted-foreground/70 hover:text-foreground hover:bg-card transition-colors cursor-grab active:cursor-grabbing"
        title="AI 助手（可拖动）"
      >
        <Bot size={18} strokeWidth={1.5} />
      </button>

      {expanded && (
        <div
          onMouseEnter={enter}
          onMouseLeave={leave}
          style={{ position: 'fixed', left: panelLeft, top: panelTop, width: 320, height: 440, zIndex: 50 }}
          className="relative flex flex-col rounded-2xl bg-card/95 backdrop-blur-md border border-border/60 shadow-xl overflow-hidden"
        >
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/30">
            <span className="text-[12px] font-semibold">AI 助手</span>
            <div className="flex items-center gap-1">
              {agentStreaming && <span className="text-[11px] text-muted-foreground animate-pulse">生成中…</span>}
              <button
                onClick={() => setPinned((p) => !p)}
                className="p-1 text-muted-foreground/60 hover:text-foreground bg-transparent border-none cursor-pointer transition-colors"
                title={pinned ? '取消固定' : '固定面板'}
              >
                {pinned ? <PinOff size={13} strokeWidth={1.5} /> : <Pin size={13} strokeWidth={1.5} />}
              </button>
              <button
                onClick={() => { setPinned(false); setHovering(false); }}
                className="p-1 text-muted-foreground/60 hover:text-foreground bg-transparent border-none cursor-pointer transition-colors"
                aria-label="收起"
              >
                <X size={14} strokeWidth={1.5} />
              </button>
            </div>
          </div>

          <div className="flex-1 space-y-2 overflow-y-auto px-3 py-2 text-[12px]">
            {visible.length === 0 && <div className="text-muted-foreground/70">和 Agent 对话，或选中正文发起润色/检查。</div>}
            {visible.slice(-14).map((m, i) => {
              // 任务 25：AgentMessage 为 discriminated union，retryMessage 仅错误消息携带
              const retryMsg = m.type === 'error' ? m.retryMessage : undefined;
              return (
                <div
                  key={i}
                  className={cn('whitespace-pre-wrap break-words', m.type === 'error' ? 'text-destructive/80' : 'text-foreground/80')}
                >
                  {m.content || (m.type === 'streaming' ? '…' : '')}
                  {retryMsg && (
                    <button
                      onClick={() => { void unlockAndRetry(retryMsg!); }}
                      className="mt-1 block text-[11px] px-2 py-0.5 rounded-md border border-destructive/30 text-destructive/90 bg-transparent hover:bg-destructive/10 cursor-pointer transition-colors"
                    >
                      解除占用并重试
                    </button>
                  )}
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          <div className="flex items-center gap-1.5 border-t border-border/30 p-2">
            <input
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submitInput(); } }}
              placeholder="和 Agent 对话…"
              className="flex-1 h-8 rounded-md px-2 text-[12px] bg-background border border-border focus:outline-none"
            />
            {agentStreaming ? (
              <button
                onClick={() => { void abort(); }}
                className="flex items-center justify-center h-8 w-8 rounded-md bg-foreground text-background border-none cursor-pointer hover:opacity-90"
                title="停止生成"
              >
                <CircleStop size={13} />
              </button>
            ) : (
              <button
                onClick={submitInput}
                disabled={!inputText.trim()}
                className="flex items-center justify-center h-8 w-8 rounded-md bg-foreground text-background border-none cursor-pointer hover:opacity-90 disabled:opacity-30"
                title="发送"
              >
                <Send size={13} />
              </button>
            )}
          </div>

          {selectionReview && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/85 backdrop-blur-sm p-3">
              <WriteReviewCard
                title="文本改写结果"
                subtitle="确认后替换选中文本"
                content={selectionReview.content}
                onAllow={(content) => {
                  window.dispatchEvent(new CustomEvent('textforge:apply-selection-replace', { detail: { start: selectionReview.start, end: selectionReview.end, content } }));
                  setSelectionReview(null);
                }}
                onReject={() => setSelectionReview(null)}
              />
            </div>
          )}

          {writeReview && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/85 backdrop-blur-sm p-3">
              <WriteReviewCard
                title="章节写入审核"
                subtitle="确认后才落盘"
                content={writeReview.content}
                onAllow={(content) => {
                  window.dispatchEvent(new CustomEvent('textforge:apply-chapter-content', { detail: { chapterId: writeReview.chapterId, content } }));
                  setWriteReview(null);
                }}
                onReject={() => setWriteReview(null)}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}
