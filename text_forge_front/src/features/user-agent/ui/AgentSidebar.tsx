// src/features/user-agent/ui/AgentSidebar.tsx
// Agent 侧边栏：右侧可折叠面板，类似 VS Code Copilot Chat

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAgentStore } from '@/features/user-agent/stores/agentStore';
import { AgentMessage, AgentPhase } from '@/features/user-agent/types/agent';
import { streamAgent, executeTextOperation } from '@/features/user-agent/api/agentApi';
import { 
  MessageBubble 
} from './MessageBubble';
import { 
  ThreadList 
} from './ThreadList';
import { 
  InputBar 
} from './InputBar';
import { 
  ThinkingPanel 
} from './ThinkingPanel';
import { 
  SidebarHandle 
} from './SidebarHandle';
import { 
  ScrollArea 
} from '@/components/ui/scroll-area';
import { 
  Button 
} from '@/components/ui/button';
import { 
  MoreHorizontal, 
  X, 
  Send, 
  Bot, 
  Moon, 
  Sun,
  Zap,
  MessageSquare,
  Settings,
  AlertCircle
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentSidebarProps {
  className?: string;
}

export function AgentSidebar({ className = '' }: AgentSidebarProps) {
  const {
    threads,
    currentThreadId,
    messages,
    toolCalls,
    plans,
    currentPhase,
    isLoading,
    error,
    selectedText,
    setSelectedText,
    setPhase,
    setLoading,
    setError,
    createThread,
    setCurrentThread,
    deleteThread,
    updateThreadTitle,
    addMessage,
    updateMessage,
    clearMessages,
    addToolCall,
    updateToolCall,
    addPlan,
    setPhase: dispatchSetPhase,
    reset
  } = useAgentStore();
  
  const [isOpen, setIsOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('dark'); // 实际应从系统或用户设置获取
  const sidebarRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<null | {
    startX: number;
    startWidth: number;
  }>(null);
  
  // 从 localStorage 恢复状态
  useEffect(() => {
    const savedState = localStorage.getItem('agentSidebarState');
    if (savedState) {
      try {
        const state = JSON.parse(savedState);
        setIsOpen(state.isOpen ?? false);
        setTheme(state.theme ?? 'dark');
        // 宽度恢复通过 CSS 变量处理
      } catch (e) {
        console.warn('Failed to parse agent sidebar state:', e);
      }
    }
    
    // 监听存储变化以支持多标签同步
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'agentSidebarState') {
        try {
          const state = JSON.parse(e.newValue || '{}');
          setIsOpen(state.isOpen ?? false);
          setTheme(state.theme ?? 'dark');
        } catch (e) {
          console.warn('Failed to parse agent sidebar state from storage event:', e);
        }
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);
  
  // 保存状态到 localStorage
  useEffect(() => {
    const state = {
      isOpen,
      theme
    };
    localStorage.setItem('agentSidebarState', JSON.stringify(state));
  }, [isOpen, theme]);
  
  // 按下 Esc 键关闭侧边栏
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false);
      }
      // Ctrl+\ 切换侧边栏展开/折叠
      if (e.ctrlKey && e.key === '\\') {
        e.preventDefault();
        setIsOpen(prev => !prev);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);
  
  // 外部点击关闭（可选）
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);
  
  // 获取当前线程的消息
  const currentMessages = messages[currentThreadId || ''] || [];
  const currentToolCalls = toolCalls[currentThreadId || ''] || [];
  const currentPlans = plans[currentThreadId || ''] || [];
  
  // 处理发送消息
  const handleSendMessage = async (content: string) => {
    if (!content.trim() || !currentThreadId) return;
    
    // 添加用户消息
    const userMessage: AgentMessage = {
      id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      threadId: currentThreadId,
      role: 'user',
      content: content.trim(),
      createdAt: new Date().toISOString()
    };
    
    addMessage(userMessage);
    setPhase('thinking');
    setLoading(true);
    setError(null);
    
    try {
      // 调用 Agent API 开始流式响应
      const stream = await streamAgent(currentThreadId);
      
      // 处理流式响应
      for await (const event of stream) {
        // 实际处理在 agentStore 的 handleSSEEvent 中
        // 这里我们只需要确保流被消费
        if (event.type === 'end') {
          break;
        }
      }
      
      setLoading(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
      setLoading(false);
      setPhase('idle');
    }
  };
  
  // 快捷操作按钮点击处理
  const handleQuickAction = async (action: string) => {
    if (!selectedText || !currentThreadId) return;
    
    setPhase('processing');
    setLoading(true);
    
    try {
      let result: { success: boolean; result?: string; error?: string } | null = null;
      
      switch (action) {
        case 'polish':
          result = await executeTextOperation(selectedText, 'polish_text');
          break;
        case 'expand':
          result = await executeTextOperation(selectedText, 'expand_text');
          break;
        case 'rephrase':
          result = await executeTextOperation(selectedText, 'rewrite_paragraph');
          break;
        case 'check':
          result = await executeTextOperation(selectedText, 'check_consistency');
          break;
        default:
          throw new Error(`Unknown action: ${action}`);
      }
      
      if (result?.success) {
        // 将结果添加为 assistant 消息
        const responseMessage: AgentMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          threadId: currentThreadId,
          role: 'assistant',
          content: result.result || '',
          createdAt: new Date().toISOString()
        };
        
        addMessage(responseMessage);
      } else {
        setError(result?.error || '操作失败');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '未知错误');
    } finally {
      setLoading(false);
      setPhase('idle');
    }
  };
  
  // 计算未读消息数量（简化实现）
  const getUnreadCount = (threadId: string): number => {
    // 实际实现可能需要跟踪已读状态
    return 0;
  };
  
  return (
    <div 
      ref={sidebarRef}
      className={cn(
        'fixed right-0 top-0 h-full z-50',
        isOpen ? 'translate-x-0' : 'translate-x-full',
        'transition-transform duration-300 ease-in-out',
        'bg-background/80 backdrop-blur-sm border-l border-border/50',
        'dark:bg-popover/80 dark:border-popover/30'
      )}
    >
      {/* 侧边栏拖拽手柄 */}
      <SidebarHandle 
        isOpen={isOpen} 
        onToggle={() => setIsOpen(!isOpen)}
        onMouseDown={(e) => {
          if (isOpen) {
            resizeRef.current = {
              startX: e.clientX,
              startWidth: sidebarRef.current?.offsetWidth ?? 380
            };
          }
        }}
      />
      
      {/* 侧边栏内容 */}
      {isOpen && (
        <div className="flex flex-col h-full w-[380px] min-w-0 overflow-hidden">
          {/* 头部 */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 bg-background/50 dark:border-popover/30">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4" />
              <h3 className="text-sm font-semibold">Agent 助手</h3>
            </div>
            <div className="flex items-center gap-2">
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsOpen(false)}
                aria-label="关闭侧边栏"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>
          
          {/* 主体内容 */}
          <div className="flex-1 overflow-hidden">
            {/* 线程列表 */}
            <div className="border-b border-border/50 bg-background/50 dark:border-popover/30">
              <ThreadList 
                threads={threads} 
                currentThreadId={currentThreadId}
                unreadCounts={{}} // 简化处理
                onThreadSelect={setCurrentThread}
                onThreadDelete={deleteThread}
                onThreadRename={updateThreadTitle}
                onNewThread={createThread}
              />
            </div>
            
            {/* 消息区域 */}
            <div className="flex-1 min-w-0 overflow-hidden relative">
              {/* 滚动区域 */}
              <ScrollArea className="h-full w-full p-4 space-y-3">
                {/* 思考面板（当前在 thinking 阶段时显示） */}
                {currentPhase === 'thinking' && (
                  <ThinkingPanel 
                    phase={currentPhase}
                    onCancel={() => {
                      setPhase('idle');
                      setLoading(false);
                    }}
                  />
                )}
                
                {/* 消息列表 */}
                <div className="space-y-3">
                  {currentMessages.map(message => (
                    <MessageBubble 
                      key={message.id}
                      message={message}
                      isLast={currentMessages.indexOf(message) === currentMessages.length - 1}
                    />
                  ))}
                  
                  {/* 正在思考的提示 */}
                  {isLoading && currentPhase === 'thinking' && (
                    <div className="flex items-center justify-center py-4">
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Bot className="h-3 w-3 animate-pulse" />
                        <span>AI 正在思考中...</span>
                      </div>
                    </div>
                  )}
                  
                  {/* 错误提示 */}
                  {error && (
                    <div className="p-3 bg-red-50/20 border border-red-50/50 rounded-lg text-sm">
                      <AlertCircle className="h-4 w-4 text-red-500 mr-2" />
                      <span>{error}</span>
                    </div>
                  )}
                </div>
              </ScrollArea>
              
              {/* 拖动调整宽度的手柄（右侧） */}
              <div 
                className="absolute right-0 top-0 h-full w-2 cursor-ew-resize bg-transparent"
                onMouseDown={(e) => {
                  if (isOpen) {
                    e.preventDefault();
                    resizeRef.current = {
                      startX: e.clientX,
                      startWidth: 380 // 默认宽度
                    };
                  }
                }}
              />
            </div>
            
            {/* 输入栏 */}
            <InputBar 
              isLoading={isLoading}
              hasError={!!error}
              onSend={handleSendMessage}
              onQuickAction={handleQuickAction}
              selectedText={selectedText}
              onClearSelectedText={() => setSelectedText(null)}
            />
          </div>
        </div>
      )}
    </div>
  );
}