'use client';

/**
 * Agent 面板消息区组件。
 * 负责：消息列表渲染（MessageItem 组件映射）、思考气泡、滚动懒加载、空状态引导、状态条。
 */
import { useCallback, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import type { AgentMessage } from '../store';
import { MessageItem } from './MessageItem';

interface MessageListProps {
  messages: AgentMessage[];
  book: { id: number; title: string } | null;
  agentStreaming: boolean;
  agentStatus: { kind: 'idle' | 'thinking' | 'working' | 'error'; message?: string; label?: string };
  agentReasoning: string;
  agentReasoningExpanded: boolean;
  onToggleReasoning: () => void;
  expandedNodeCards: Set<string>;
  onToggleNode: (nodeId: string) => void;
  nodeOutputs: Record<string, string>;
  onReviewAction: (action: 'accept' | 'retry' | 'edit' | 'terminate', editedContent?: string, chapterId?: number) => void;
  onSendMessage: (msg: string) => void;
  onPickSuggestion: (suggestion: string) => void;
  onCopy: (text: string) => void;
  onEditSend: (msg: AgentMessage) => void;
  onUnlockAndRetry: (retryMessage: string) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  loadMoreHistory: (convId: number, totalLoaded: number) => Promise<number>;
  historyConvId: number | null;
  historyLoadedCount: number;
  onHistoryLoadedChange: (fn: (n: number) => number) => void;
}

export function MessageList(props: MessageListProps) {
  const {
    messages, book, agentStreaming, agentStatus, agentReasoning, agentReasoningExpanded,
    onToggleReasoning, expandedNodeCards, onToggleNode, nodeOutputs,
    onReviewAction, onSendMessage, onPickSuggestion, onCopy, onEditSend, onUnlockAndRetry,
    messagesEndRef, loadMoreHistory, historyConvId, historyLoadedCount, onHistoryLoadedChange,
  } = props;
  const loadingMoreRef = useRef(false);
  const historyScrollElRef = useRef<HTMLElement | null>(null);

  const handleScroll = useCallback((e: React.UIEvent<HTMLElement>) => {
    // 滚动到顶部附近时懒加载更早历史消息
    const el = e.currentTarget;
    historyScrollElRef.current = el;
    if (el.scrollTop < 120 && !loadingMoreRef.current) {
      const convId = historyConvId;
      const loaded = historyLoadedCount;
      if (convId != null && loaded > 0) {
        loadingMoreRef.current = true;
        void loadMoreHistory(convId, loaded).then((added) => {
          onHistoryLoadedChange((n) => (added > 0 ? n + added : n));
          loadingMoreRef.current = false;
        });
      }
    }
  }, [historyConvId, historyLoadedCount, loadMoreHistory, onHistoryLoadedChange]);

  // 2.1：propose_cards 功能已删除——首项改「分析创作状态」，走纯文本分析（不再要求 JSON 卡片格式）
  const SUGGESTIONS = ['分析创作状态', '构思剧情走向', '设计角色对话', '优化章节大纲', '检查设定矛盾'];

  return (
    <div
      className="ide-agent-body"
      onScroll={handleScroll}
    >
      {messages.length === 0 && (
        <div className="flex flex-col items-center gap-4 mt-12 px-4">
          <div className="text-xs text-muted-foreground text-center">
            {book ? `正在创作《${book.title}》` : '输入消息开始对话'}
          </div>
          {book && (
            <>
              <div className="flex flex-wrap justify-center gap-1.5">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      if (s === '分析创作状态') {
                        // 2.1：与删除的卡片功能对齐——纯文本分析，不再输出 JSON 卡片格式
                        void onSendMessage('请分析当前书籍的创作状态：当前处于哪个创作阶段（世界观/大纲/正文/修订），哪些环节薄弱、哪些设定存在矛盾或遗漏，并给出下一步创作建议。');
                      } else {
                        onPickSuggestion(s);
                      }
                    }}
                    className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30 cursor-pointer transition-colors"
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap justify-center gap-1.5">
                <button onClick={() => void onSendMessage('请调用 search 工具（mode="web"）联网搜索，获取最新外部信息。')} className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30 cursor-pointer transition-colors">联网搜索</button>
                <button onClick={() => void onSendMessage('请调用 search 工具（mode="docs"）在公开文档库中做语义检索，寻找相关资料。')} className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30 cursor-pointer transition-colors">检索知识库</button>
                <button onClick={() => void onSendMessage('请调用 manage_memory 工具（mode="save"）保存本次创作中值得沉淀的偏好/设定要点作为长期记忆。')} className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30 cursor-pointer transition-colors">保存记忆</button>
                <button onClick={() => void onSendMessage('请调用 manage_memory 工具（mode="recall"）调取与本作品相关的长期记忆。')} className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30 cursor-pointer transition-colors">调取记忆</button>
                <button onClick={() => void onSendMessage('请调用 update_entity 工具（kind="timeline"）更新时间线事件。')} className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30 cursor-pointer transition-colors">更新时间线</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 思考气泡（Kilo/Claude Code 模式）。
          默认展开、半透明、可折叠；固定在消息区顶部，不随主消息滚动；
          内容仅流式累积于 store（agentReasoning），不写入会话历史。 */}
      {agentReasoning.trim() && (
        <div className="px-3 pt-2">
          <div className="rounded-lg border border-foreground/10 bg-foreground/[0.04] backdrop-blur-sm overflow-hidden">
            <button
              onClick={onToggleReasoning}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-[10px] text-muted-foreground/70 bg-transparent border-none cursor-pointer hover:text-foreground text-left"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400/70 inline-block shrink-0" />
              <span className="font-medium">思考中</span>
              {agentStatus.kind === 'thinking' && <span className="thinking-shimmer-text text-[10px]">正在酝酿…</span>}
              <ChevronDown size={11} strokeWidth={1.5} className={cn('ml-auto text-foreground/30 transition-transform', agentReasoningExpanded && 'rotate-180')} />
            </button>
            {agentReasoningExpanded && (
              <div className="px-3 pb-2 text-[11px] leading-relaxed text-foreground/60 whitespace-pre-wrap break-words max-h-40 overflow-y-auto">
                {agentReasoning}
              </div>
            )}
          </div>
        </div>
      )}

      {messages
        .map((msg, idx) => (
          <MessageItem
            key={msg.id || `i-${idx}`}
            msg={msg}
            index={idx}
            expandedNodeCards={expandedNodeCards}
            onToggleNode={onToggleNode}
            nodeOutputs={nodeOutputs}
            agentStreaming={agentStreaming}
            agentStatusKind={agentStatus.kind}
            onReviewAction={onReviewAction}
            onSendMessage={onSendMessage}
            onCopy={onCopy}
            onEditSend={onEditSend}
            onUnlockAndRetry={onUnlockAndRetry}
          />
        ))}
      <div ref={messagesEndRef} />
      {/* 工具卡片/节点卡片已作为独立消息渲染在消息流中（顺序由插入时刻决定） */}
      {agentStatus.kind === 'working' && agentStatus.label && !messages.some((m) => m.type === 'node') && (
        <div className="px-3 py-1.5 text-[11px]">
          <span className="thinking-shimmer-text">{agentStatus.label}</span>
        </div>
      )}
      {agentStatus.kind === 'error' && (
        <div className="px-3 py-1.5 text-[11px] text-destructive/80 border-t border-border/30 bg-destructive/[0.04]">
          {agentStatus.message}
        </div>
      )}
    </div>
  );
}
