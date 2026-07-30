// src/features/user-agent/ui/ThreadList.tsx
// 线程列表组件：新建、切换、删除、重命名

'use client';

import { useState, useRef } from 'react';
import { 
  Plus, 
  Trash2, 
  Edit2, 
  MessageSquare, 
  X,
  MoreVertical,
  ChevronDown
} from 'lucide-react';
import { 
  Button 
} from '@/components/ui/button';
import { 
  Input 
} from '@/components/ui/input';
import { 
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator
} from '@/components/ui/dropdown-menu';
import { 
  ScrollArea 
} from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import type { AgentThread } from '@/features/user-agent/types/agent';

interface ThreadListProps {
  threads: AgentThread[];
  currentThreadId: string | null;
  unreadCounts: Record<string, number>;
  onThreadSelect: (threadId: string) => void;
  onThreadDelete: (threadId: string) => void;
  onThreadRename: (threadId: string, newTitle: string) => void;
  onNewThread: (title?: string) => void;
}

export function ThreadList({ 
  threads, 
  currentThreadId, 
  unreadCounts, 
  onThreadSelect, 
  onThreadDelete, 
  onThreadRename,
  onNewThread 
}: ThreadListProps) {
  const [renamingThreadId, setRenamingThreadId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [hoveredThreadId, setHoveredThreadId] = useState<string | null>(null);
  
  const handleStartRename = (thread: AgentThread) => {
    setRenamingThreadId(thread.id);
    setRenameValue(thread.title);
    setTimeout(() => renameInputRef.current?.focus(), 0);
  };
  
  const handleConfirmRename = (threadId: string) => {
    if (renameValue.trim() && renameValue !== threads.find(t => t.id === threadId)?.title) {
      onThreadRename(threadId, renameValue.trim());
    }
    setRenamingThreadId(null);
    setRenameValue('');
  };
  
  const handleCancelRename = () => {
    setRenamingThreadId(null);
    setRenameValue('');
  };
  
  const handleKeyDown = (e: React.KeyboardEvent, threadId: string) => {
    if (e.key === 'Enter') {
      handleConfirmRename(threadId);
    } else if (e.key === 'Escape') {
      handleCancelRename();
    }
  };
  
  const formatTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}天前`;
    return date.toLocaleDateString();
  };
  
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          对话线程
        </h4>
        <Button 
          variant="ghost" 
          size="icon" 
          className="h-6 w-6"
          onClick={() => onNewThread()}
          aria-label="新建对话"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-2 space-y-1">
          {threads.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-8 text-center">
              <MessageSquare className="h-8 w-8 text-muted-foreground/30 mb-2" />
              <p className="text-xs text-muted-foreground/60 mb-4">
                暂无对话记录
              </p>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-8 px-3"
                onClick={() => onNewThread()}
              >
                <Plus className="h-3 w-3 mr-1.5" />
                新建对话
              </Button>
            </div>
          ) : (
            threads.map((thread) => (
              <div
                key={thread.id}
                className={cn(
                  'group relative rounded-lg transition-all duration-150',
                  currentThreadId === thread.id
                    ? 'bg-primary/10 border border-primary/20'
                    : 'bg-transparent hover:bg-accent/50',
                  renamingThreadId === thread.id && 'bg-accent/50'
                )}
                onMouseEnter={() => setHoveredThreadId(thread.id)}
                onMouseLeave={() => setHoveredThreadId(null)}
              >
                {renamingThreadId === thread.id ? (
                  <Input
                    ref={renameInputRef}
                    value={renameValue}
                    onChange={(e) => setRenameValue(e.target.value)}
                    onBlur={() => handleConfirmRename(thread.id)}
                    onKeyDown={(e) => handleKeyDown(e, thread.id)}
                    className="w-full px-2 py-1.5 text-sm"
                    autoFocus
                  />
                ) : (
                  <button
                    className={cn(
                      'w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left',
                      'transition-colors duration-100',
                      currentThreadId === thread.id
                        ? 'text-primary'
                        : 'text-foreground hover:text-foreground/80'
                    )}
                    onClick={() => onThreadSelect(thread.id)}
                  >
                    <MessageSquare className={cn(
                      'h-4 w-4 shrink-0',
                      currentThreadId === thread.id ? 'text-primary' : 'text-muted-foreground/50'
                    )} />
                    
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        'truncate text-sm font-medium',
                        currentThreadId === thread.id ? 'text-primary' : ''
                      )}>
                        {thread.title}
                      </p>
                      <p className="truncate text-[10px] text-muted-foreground/60">
                        {thread.messageCount} 条消息 · {formatTime(thread.updatedAt || thread.createdAt)}
                      </p>
                    </div>
                    
                    {unreadCounts[thread.id] && unreadCounts[thread.id] > 0 && (
                      <span className="flex items-center justify-center w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px]">
                        {unreadCounts[thread.id] > 9 ? '9+' : unreadCounts[thread.id]}
                      </span>
                    )}
                    
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          aria-label="更多操作"
                        >
                          <MoreVertical className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[160px]">
                        <DropdownMenuItem 
                          className="cursor-pointer"
                          onClick={() => handleStartRename(thread)}
                        >
                          <Edit2 className="h-3.5 w-3.5 mr-2" />
                          重命名
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem 
                          className="text-red-500 focus:text-red-500 cursor-pointer"
                          onClick={() => onThreadDelete(thread.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" />
                          删除
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </button>
)}
              </div>
            )))}
        </div>
      </ScrollArea>
      
      {threads.length > 0 && (
        <div className="px-3 py-2 border-t border-border/50">
          <p className="text-[10px] text-muted-foreground/60 text-center">
            快捷键：<kbd className="px-1 py-0.5 bg-muted rounded text-[9px]">Ctrl+\\</kbd> 切换面板
          </p>
        </div>
      )}
    </div>
  );
}