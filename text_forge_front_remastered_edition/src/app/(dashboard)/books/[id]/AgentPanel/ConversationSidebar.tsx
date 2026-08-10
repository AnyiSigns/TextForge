'use client';

/**
 * 任务 24：Agent 面板会话列表组件。
 * 负责：会话搜索、刷新、重命名、删除、展开/收起。
 */
import { Pencil, PanelRightClose, RefreshCw, Search, Trash2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import type { AgentConversation } from '@/shared/api/types';

function relativeTime(dateStr: string): string {
  const s = dateStr.trim();
  const normalized = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(s) ? s : `${s}Z`;
  const now = Date.now();
  const diff = now - new Date(normalized).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes}分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}天前`;
  return `${Math.floor(days / 7)}周前`;
}

interface ConversationSidebarProps {
  sessions: AgentConversation[];
  loadingSessions: boolean;
  agentThreadId: string | null;
  sessionSearch: string;
  renamingSessionId: number | null;
  renameDraft: string;
  onSearch: (v: string) => void;
  onRefresh: () => void;
  onCollapse: () => void;
  onSelect: (s: AgentConversation) => void;
  onRenameStart: (s: AgentConversation) => void;
  onRenameDraft: (v: string) => void;
  onRenameConfirm: (s: AgentConversation) => void;
  onRenameCancel: () => void;
  onDelete: (s: AgentConversation) => void;
}

export function ConversationSidebar(props: ConversationSidebarProps) {
  const {
    sessions, loadingSessions, agentThreadId, sessionSearch, renamingSessionId, renameDraft,
    onSearch, onRefresh, onCollapse, onSelect, onRenameStart, onRenameDraft, onRenameConfirm, onRenameCancel, onDelete,
  } = props;

  const filteredSessions = sessions.filter((s) =>
    !sessionSearch.trim() || (s.title || '').toLowerCase().includes(sessionSearch.toLowerCase())
  );

  return (
    <div className="ide-agent-sessions">
      <div className="ide-agent-sessions-header">
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-medium text-muted-foreground">会话</span>
          <button onClick={onRefresh} className="agent-icon-btn" title="刷新">
            <RefreshCw size={12} strokeWidth={1.8} />
          </button>
        </div>
        <button onClick={onCollapse} className="agent-icon-btn" title="收起会话列表">
          <PanelRightClose size={12} strokeWidth={1.8} />
        </button>
      </div>
      <div className="px-2 pb-1">
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/30" />
          <input
            value={sessionSearch}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="搜索会话..."
            className="w-full h-7 pl-6 pr-2 rounded-md text-[11px] bg-muted/50 border border-border/30 focus:outline-none focus:border-foreground/20"
          />
        </div>
      </div>
      <div className="ide-agent-sessions-list">
        {loadingSessions ? (
          <div className="text-[11px] text-muted-foreground text-center py-4">加载中...</div>
        ) : filteredSessions.length === 0 ? (
          <div className="text-[11px] text-muted-foreground text-center py-4">暂无会话记录</div>
        ) : (
          filteredSessions.map((s) => {
            const isActive = s.threadId === agentThreadId;
            const isRenaming = renamingSessionId === s.id;
            return (
              <div
                key={s.id}
                onClick={() => { if (!isRenaming) onSelect(s); }}
                className={cn(
                  'agent-session-item group',
                  isActive && 'is-active',
                )}
              >
                {isRenaming ? (
                  <div className="flex-1 min-w-0 flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                    <input
                      value={renameDraft}
                      onChange={(e) => onRenameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); onRenameConfirm(s); }
                        if (e.key === 'Escape') { e.preventDefault(); onRenameCancel(); }
                      }}
                      onBlur={() => { onRenameConfirm(s); }}
                      autoFocus
                      placeholder="会话标题…"
                      className="w-full h-6 px-1.5 rounded text-[12px] bg-background border border-foreground/25 focus:outline-none"
                    />
                  </div>
                ) : (
                  <>
                    <div className="flex-1 min-w-0">
                      <div className="text-[12px] font-medium text-foreground truncate">{s.title || '未命名会话'}</div>
                      <div className="text-[10px] text-muted-foreground truncate mt-0.5 flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400/60 flex-shrink-0" />
                        <span>{relativeTime(s.updatedAt)}</span>
                      </div>
                    </div>
                    <button
                      onClick={(e) => { e.stopPropagation(); onRenameStart(s); }}
                      className="w-4 h-4 flex items-center justify-center rounded text-muted-foreground/30 hover:text-foreground/70 opacity-0 group-hover:opacity-100 transition-all bg-transparent border-none cursor-pointer flex-shrink-0"
                      title="重命名会话"
                    >
                      <Pencil size={11} strokeWidth={1.5} />
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onDelete(s); }}
                      className="w-4 h-4 flex items-center justify-center rounded text-muted-foreground/30 hover:text-red-500/60 opacity-0 group-hover:opacity-100 transition-all bg-transparent border-none cursor-pointer flex-shrink-0"
                      title="删除会话"
                    >
                      <Trash2 size={11} strokeWidth={1.5} />
                    </button>
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
