'use client';

import { useEffect, useState } from 'react';
import { Bot, X } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useBookDetailStore } from '@/app/(dashboard)/books/[id]/store';
import { useAgentSender } from './useAgentSender';

type SelectionDetail = { text: string; mode: string };

/**
 * manuscript 页的轻量 Agent 监听：接收编辑器选区/章节事件，复用 useAgentSender 发送并内联展示回复。
 * AgentPanel 只在 (dashboard) 布局挂载，编辑器所在的 manuscript 路由需本组件承接 textforge:* 事件。
 */
export function AgentDock() {
  const [open, setOpen] = useState(false);
  const { sendMessage, messagesEndRef } = useAgentSender();
  const agentMessages = useBookDetailStore((s) => s.agentMessages);
  const agentStreaming = useBookDetailStore((s) => s.agentStreaming);

  useEffect(() => {
    const handleTransform = (e: Event) => {
      const d = (e as CustomEvent).detail as SelectionDetail | undefined;
      if (!d || !d.text) return;
      setOpen(true);
      void sendMessage(`请调用 transform_text 工具（mode=${d.mode || 'polish'}）处理以下选中文本：\n\n${d.text}`);
    };
    const handleReview = (e: Event) => {
      const d = (e as CustomEvent).detail as SelectionDetail | undefined;
      if (!d || !d.text) return;
      setOpen(true);
      void sendMessage(`请调用 review_text 工具（mode=${d.mode || 'grammar'}）检查以下文本：\n\n${d.text}`);
    };
    const handleChapter = (e: Event) => {
      const d = (e as CustomEvent).detail as Record<string, unknown> | undefined;
      const chapterId = d?.chapterId as number | undefined;
      if (!chapterId) return;
      setOpen(true);
      if (d?.action === 'write') {
        void sendMessage(`请调用 write_chapter_content 工具（chapter_id=${chapterId}）写入本章正文。`);
      } else {
        void sendMessage(`请调用 read_chapter_content 工具读取本章（chapter_id=${chapterId}），然后基于正文给出续写/修改建议。`);
      }
    };
    window.addEventListener('textforge:transform-selection', handleTransform);
    window.addEventListener('textforge:review-selection', handleReview);
    window.addEventListener('textforge:chapter-agent', handleChapter);
    return () => {
      window.removeEventListener('textforge:transform-selection', handleTransform);
      window.removeEventListener('textforge:review-selection', handleReview);
      window.removeEventListener('textforge:chapter-agent', handleChapter);
    };
  }, [sendMessage]);

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-4 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-foreground text-background shadow-lg hover:opacity-90"
        title="AI 助手"
      >
        <Bot size={18} />
      </button>
    );
  }

  const visible = agentMessages.filter(
    (m) => m.role === 'assistant' && (m.content || m.type === 'streaming'),
  );

  return (
    <div className="fixed bottom-4 right-4 z-50 flex h-[340px] w-[300px] flex-col overflow-hidden rounded-lg border border-border bg-background shadow-xl">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <span className="text-[12px] font-semibold">AI 助手</span>
        <div className="flex items-center gap-1.5">
          {agentStreaming && <span className="text-[11px] text-muted-foreground animate-pulse">生成中…</span>}
          <button
            onClick={() => setOpen(false)}
            className="p-1 text-muted-foreground hover:text-foreground"
            aria-label="收起"
          >
            <X size={14} />
          </button>
        </div>
      </div>
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-2 text-[12px]">
        {visible.length === 0 && <div className="text-muted-foreground">选中文本后，从浮出工具条发起润色/检查。</div>}
        {visible.slice(-12).map((m, i) => (
          <div
            key={i}
            className={cn(
              'whitespace-pre-wrap break-words',
              m.type === 'error' ? 'text-red-500' : 'text-foreground/80',
            )}
          >
            {m.content || (m.type === 'streaming' ? '…' : '')}
          </div>
        ))}
      </div>
      <div ref={messagesEndRef} />
    </div>
  );
}
