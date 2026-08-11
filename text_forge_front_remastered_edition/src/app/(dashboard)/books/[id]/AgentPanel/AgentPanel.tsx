'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Shrink, BookOpen, PanelRightOpen, X } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/shared/lib/cn';
import { useBookDetailStore } from '../store';
import { useAgentSender } from '@/features/agent/useAgentSender';
import * as workflowApi from '@/shared/api/workflows';
import type { Workflow } from '@/shared/api/workflows';
import { AgentMemoryManager } from './AgentMemoryManager';
import { MessageList } from './MessageList';
import { AgentInput } from './AgentInput';
import { ConversationSidebar } from './ConversationSidebar';
import { useAgentReview } from './useAgentReview';
import { useBookLock } from './useBookLock';
import { useModelConfigured } from './useModelConfigured';
import { useAgentSessions } from './useAgentSessions';
import { useAgentMentions } from './useAgentMentions';
import { useManualCompress } from './useManualCompress';
import { useExpandedNodeCards } from './useExpandedNodeCards';

interface AgentPanelProps {
  panelFullscreen?: boolean;
  onToggleFullscreen?: () => void;
}

export function AgentPanel({ panelFullscreen, onToggleFullscreen }: AgentPanelProps) {
  const [input, setInput] = useState('');
  const [showMemoryManager, setShowMemoryManager] = useState(false);
  const [sessionsExpanded, setSessionsExpanded] = useState(true);
  const [workflowList, setWorkflowList] = useState<Workflow[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const bookId = useBookDetailStore((s) => s.bookId);
  const book = useBookDetailStore((s) => s.book);
  const agentOpen = useBookDetailStore((s) => s.agentOpen);
  const agentMessages = useBookDetailStore((s) => s.agentMessages);
  const agentStreaming = useBookDetailStore((s) => s.agentStreaming);
  const agentStatus = useBookDetailStore((s) => s.agentStatus);
  const agentReasoning = useBookDetailStore((s) => s.agentReasoning);
  const agentReasoningExpanded = useBookDetailStore((s) => s.agentReasoningExpanded);
  const agentNodeStatuses = useBookDetailStore((s) => s.agentNodeStatuses);
  const nodeOutputs = useBookDetailStore((s) => s.nodeOutputs);
  const agentThreadId = useBookDetailStore((s) => s.agentThreadId);
  const setAgentReasoningExpanded = useBookDetailStore((s) => s.setAgentReasoningExpanded);
  const setAgentOpen = useBookDetailStore((s) => s.setAgentOpen);

  const { sendMessage, abort, resume, messagesEndRef } = useAgentSender();

  const modelConfigured = useModelConfigured();
  const { bookLocked, handleForceReleaseLock } = useBookLock(bookId, agentOpen);
  const { expandedNodeCards, toggleNodeCard } = useExpandedNodeCards(agentNodeStatuses);
  const {
    sessions,
    loadingSessions,
    sessionSearch,
    setSessionSearch,
    renamingSessionId,
    setRenamingSessionId,
    renameDraft,
    setRenameDraft,
    historyLoadedCount,
    setHistoryLoadedCount,
    historyConvId,
    fetchSessions,
    handleNewSession,
    handleSelectSession,
    loadMoreHistory,
    handleDeleteSession,
    handleRenameStart,
    handleRenameConfirm,
  } = useAgentSessions({ bookId, input, setInput, abort });
  const { mention, setMention, detectMention, applyMention, handleInputKeyDown: mentionKeyDown } = useAgentMentions({ bookId, inputRef, setInput });
  const { handleManualCompress } = useManualCompress({ agentThreadId, agentStreaming });

  // 任务 24：审核 / 重试 / 复制 / 编辑重发逻辑抽到 useAgentReview
  const { handleReviewAction, handleUnlockAndRetry, handleCopyMessage, handleEditSend } = useAgentReview({
    agentThreadId,
    bookId,
    resume,
    sendMessage,
    onSetInput: setInput,
    onFocusInput: () => inputRef.current?.focus(),
  });

  useEffect(() => {
    workflowApi.listWorkflows().then(setWorkflowList).catch(() => {});
  }, []);

  const showWorkflowSuggestions = input.trim().startsWith('用') && workflowList.length > 0;

  const handleSend = useCallback(() => {
    const msg = input.trim();
    if (!msg) return;
    setInput('');
    setMention(null);
    void sendMessage(msg);
  }, [input, sendMessage, setMention]);

  // 任务 23：@角色/#设定 提及——输入时检测触发词，弹出建议浮层
  const handleInputChange = useCallback((value: string, el: HTMLTextAreaElement) => {
    setInput(value);
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    detectMention(value, el.selectionStart ?? value.length);
  }, [setInput, detectMention]);

  const handleInputKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => mentionKeyDown(e, () => void handleSend()),
    [mentionKeyDown, handleSend],
  );

  const handleWorkflowSelect = useCallback((wf: Workflow) => {
    // 2.8：提示词示例为半角 (ID: xxx)（subgraph_prompts.py），全角会导致模型无法匹配
    const msg = `请用工作流"${wf.name}" (ID: ${wf.id}) 执行创作任务。`;
    setInput('');
    void sendMessage(msg);
  }, [sendMessage]);

  // 任务 25：abort 的统一复位语义收敛在 useAgentSender.abort（streaming→system、
  // running/pending 工具卡→error、清空节点/审核/思考状态），面板侧仅作入口。
  const handleAbort = () => {
    abort();
  };

  const placeholderText = book ? '输入创作指令…' : '输入消息…';

  return (
    <div className="ide-agent">
      <div className="ide-agent-header">
        <div className="flex items-center gap-1.5">
          <span className="font-semibold text-[13px]">AI 助手</span>
          <span className="text-[10px] text-muted-foreground/60 bg-muted/50 px-1.5 py-px rounded">聊天</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button onClick={handleNewSession} className="agent-icon-btn" title="新建会话">
            <Plus size={14} strokeWidth={1.8} />
          </button>
          <button onClick={() => void handleManualCompress()} className="agent-icon-btn" title="压缩上下文" disabled={!agentThreadId || agentStreaming}>
            <Shrink size={12} strokeWidth={1.8} />
          </button>
          {/* 任务 22：记忆按钮入口常驻（原来仅在会话列表收起时显示） */}
          {bookId > 0 && (
            <button onClick={() => setShowMemoryManager(true)} className="agent-icon-btn" title="记忆">
              <BookOpen size={12} strokeWidth={1.8} />
            </button>
          )}
          {!sessionsExpanded && (
            <button onClick={() => setSessionsExpanded(true)} className="agent-icon-btn" title="展开会话列表">
              <PanelRightOpen size={12} strokeWidth={1.8} />
            </button>
          )}
          <button
            onClick={onToggleFullscreen}
            className="agent-icon-btn"
            title={panelFullscreen ? '还原' : '全屏'}
          >
            <span className={cn('block w-3 h-3 relative', panelFullscreen && 'text-foreground')}>
              <span className={cn('absolute top-0 left-0 w-1 h-1 border-l border-t', panelFullscreen ? 'border-foreground/60' : 'border-foreground/40')} />
              <span className={cn('absolute top-0 right-0 w-1 h-1 border-r border-t', panelFullscreen ? 'border-foreground/60' : 'border-foreground/40')} />
              <span className={cn('absolute bottom-0 left-0 w-1 h-1 border-l border-b', panelFullscreen ? 'border-foreground/60' : 'border-foreground/40')} />
              <span className={cn('absolute bottom-0 right-0 w-1 h-1 border-r border-b', panelFullscreen ? 'border-foreground/60' : 'border-foreground/40')} />
            </span>
          </button>
          <button
            onClick={() => setAgentOpen(false)}
            className="agent-icon-btn"
            title="关闭面板"
          >
            <X size={14} strokeWidth={1.8} />
          </button>
        </div>
      </div>

      {bookLocked && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-amber-500/[0.06]">
          <span className="text-[11px] text-amber-600/90 flex-1">该书正在执行 Agent 任务，新操作可能被拒绝</span>
          <button
            onClick={() => { void handleForceReleaseLock(); }}
            className="text-[11px] font-medium text-foreground underline underline-offset-2 hover:opacity-70 bg-transparent border-none cursor-pointer"
          >
            强制解除
          </button>
        </div>
      )}

      {modelConfigured === false && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-destructive/[0.04]">
          <span className="text-[11px] text-destructive/80 flex-1">尚未配置模型，AI 助手无法工作</span>
          <Link href="/settings" className="text-[11px] font-medium text-foreground underline underline-offset-2 hover:opacity-70">
            去设置
          </Link>
        </div>
      )}

      <div className="ide-agent-main">
        <div className="ide-agent-chat">
          <MessageList
            messages={agentMessages}
            book={book}
            agentStreaming={agentStreaming}
            agentStatus={agentStatus}
            agentReasoning={agentReasoning}
            agentReasoningExpanded={agentReasoningExpanded}
            onToggleReasoning={() => setAgentReasoningExpanded(!agentReasoningExpanded)}
            expandedNodeCards={expandedNodeCards}
            onToggleNode={toggleNodeCard}
            nodeOutputs={nodeOutputs}
            onReviewAction={handleReviewAction}
            onSendMessage={(msg) => void sendMessage(msg)}
            onPickSuggestion={(s) => { setInput(s); inputRef.current?.focus(); }}
            onCopy={handleCopyMessage}
            onEditSend={handleEditSend}
            onUnlockAndRetry={handleUnlockAndRetry}
            messagesEndRef={messagesEndRef}
            loadMoreHistory={loadMoreHistory}
            historyConvId={historyConvId}
            historyLoadedCount={historyLoadedCount}
            onHistoryLoadedChange={setHistoryLoadedCount}
          />

          <AgentInput
            input={input}
            placeholderText={placeholderText}
            agentStreaming={agentStreaming}
            showWorkflowSuggestions={showWorkflowSuggestions}
            workflowList={workflowList}
            mention={mention}
            inputRef={inputRef}
            onInputChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            onApplyMention={applyMention}
            onMentionHover={(i) => setMention((m) => (m ? { ...m, index: i } : m))}
            onSend={() => { void handleSend(); }}
            onAbort={handleAbort}
            onWorkflowSelect={handleWorkflowSelect}
          />
        </div>

        {sessionsExpanded && (
          <ConversationSidebar
            sessions={sessions}
            loadingSessions={loadingSessions}
            agentThreadId={agentThreadId}
            sessionSearch={sessionSearch}
            renamingSessionId={renamingSessionId}
            renameDraft={renameDraft}
            onSearch={setSessionSearch}
            onRefresh={() => { void fetchSessions(); }}
            onCollapse={() => setSessionsExpanded(false)}
            onSelect={(s) => { void handleSelectSession(s); }}
            onRenameStart={handleRenameStart}
            onRenameDraft={setRenameDraft}
            onRenameConfirm={(s) => { void handleRenameConfirm(s); }}
            onRenameCancel={() => setRenamingSessionId(null)}
            onDelete={(s) => { void handleDeleteSession(s); }}
          />
        )}
      </div>

      {showMemoryManager && (
        <AgentMemoryManager bookId={bookId} onClose={() => setShowMemoryManager(false)} />
      )}
    </div>
  );
}
