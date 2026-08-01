// src/features/user-agent/ui/AgentFloatingWindow.tsx
// Agent 浮层对话窗：可拖拽、可缩放、可全屏（不覆盖主侧边栏）

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useAgentStore } from '@/features/user-agent/stores/agentStore';
import { AgentMessage } from '@/features/user-agent/types/agent';
import { streamAgent, executeTextOperation } from '@/features/user-agent/api/agentApi';
import { useModelStore } from '@/features/settings/stores/modelStore';
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
  ScrollArea
} from '@/components/ui/scroll-area';
import {
  Button
} from '@/components/ui/button';
import {
  X,
  Bot,
  AlertCircle,
  GripHorizontal,
  Maximize2,
  Minimize2
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AgentFloatingWindowProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}

const DEFAULT_WIDTH = 440;
const DEFAULT_HEIGHT = 560;
const MIN_WIDTH = 320;
const MIN_HEIGHT = 380;

const EDGE_RESIZE_WIDTH = 6;

export function AgentFloatingWindow({ isOpen, onToggle, onClose }: AgentFloatingWindowProps) {
  const {
    threads,
    currentThreadId,
    messages,
    currentPhase,
    isLoading,
    error,
    selectedText,
    setSelectedText,
    setPhase,
    setLoading,
    setError,
    handleSSEEvent,
    createThread,
    setCurrentThread,
    deleteThread,
    updateThreadTitle,
    addMessage,
  } = useAgentStore();

  const [isFullSize, setIsFullSize] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
  const [isPositioned, setIsPositioned] = useState(false);

  const windowRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{
    startMouseX: number;
    startMouseY: number;
    startLeft: number;
    startTop: number;
  } | null>(null);
  const resizeDir = useRef<'n' | 'w' | 'nw' | null>(null);
  const resizeStart = useRef<{
    startMouseX: number;
    startMouseY: number;
    startLeft: number;
    startTop: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  const getModelConfig = () => {
    const modelStore = useModelStore.getState()
    const { textRoleModels } = modelStore
    return {
      main_config: textRoleModels.main ?? null,
      audit_config: textRoleModels.audit ?? null,
      router_config: textRoleModels.router ?? null,
      tool_config: textRoleModels.tool ?? null,
    }
  }

  useEffect(() => {
    if (isOpen && !isPositioned) {
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      setPosition({
        x: vw - DEFAULT_WIDTH - 16,
        y: vh - DEFAULT_HEIGHT - 56,
      });
      setSize({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
      setIsPositioned(true);
    }
    if (!isOpen) {
      setIsPositioned(false);
      setIsFullSize(false);
    }
  }, [isOpen, isPositioned]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        e.preventDefault();
        onClose();
      }
      if (e.ctrlKey && e.key === '\\') {
        e.preventDefault();
        onToggle();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose, onToggle]);

  const clampPositionX = useCallback((x: number, w: number) => {
    const maxLeft = window.innerWidth - w;
    return Math.max(0, Math.min(x, maxLeft));
  }, []);

  const clampPositionY = useCallback((y: number, h: number) => {
    const maxTop = window.innerHeight - h;
    return Math.max(0, Math.min(y, maxTop));
  }, []);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (!windowRef.current || isFullSize) return;
    e.preventDefault();
    const rect = windowRef.current.getBoundingClientRect();
    dragRef.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const dx = ev.clientX - dragRef.current.startMouseX;
      const dy = ev.clientY - dragRef.current.startMouseY;
      const newX = clampPositionX(dragRef.current.startLeft + dx, size.width);
      const newY = clampPositionY(dragRef.current.startTop + dy, size.height);
      setPosition({ x: newX, y: newY });
    };

    const onMouseUp = () => {
      dragRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'grabbing';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [isFullSize, size, clampPositionX, clampPositionY]);

  const handleResizeStart = useCallback((e: React.MouseEvent, dir: 'n' | 'w' | 'nw') => {
    if (!windowRef.current || isFullSize) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = windowRef.current.getBoundingClientRect();
    resizeDir.current = dir;
    resizeStart.current = {
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      startWidth: rect.width,
      startHeight: rect.height,
    };

    const onMouseMove = (ev: MouseEvent) => {
      if (!resizeStart.current || !resizeDir.current) return;
      const dir = resizeDir.current;
      const dx = ev.clientX - resizeStart.current.startMouseX;
      const dy = ev.clientY - resizeStart.current.startMouseY;

      let newWidth = resizeStart.current.startWidth;
      let newHeight = resizeStart.current.startHeight;
      let newLeft = resizeStart.current.startLeft;
      let newTop = resizeStart.current.startTop;

      if (dir === 'w' || dir === 'nw') {
        newWidth = resizeStart.current.startWidth - dx;
        if (newWidth < MIN_WIDTH) {
          newWidth = MIN_WIDTH;
          newLeft = resizeStart.current.startLeft + resizeStart.current.startWidth - MIN_WIDTH;
        } else {
          newLeft = resizeStart.current.startLeft + dx;
        }
      }

      if (dir === 'n' || dir === 'nw') {
        newHeight = resizeStart.current.startHeight - dy;
        if (newHeight < MIN_HEIGHT) {
          newHeight = MIN_HEIGHT;
          newTop = resizeStart.current.startTop + resizeStart.current.startHeight - MIN_HEIGHT;
        } else {
          newTop = resizeStart.current.startTop + dy;
        }
      }

      newLeft = clampPositionX(newLeft, newWidth);
      newTop = clampPositionY(newTop, newHeight);

      setPosition({ x: newLeft, y: newTop });
      setSize({ width: newWidth, height: newHeight });
    };

    const onMouseUp = () => {
      resizeDir.current = null;
      resizeStart.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };

    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [isFullSize, clampPositionX, clampPositionY]);

  const handleFullSizeToggle = useCallback(() => {
    setIsFullSize((prev) => !prev);
  }, []);

  const currentMessages = messages[currentThreadId || ''] || [];

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || !currentThreadId) return;

    const userMessage: AgentMessage = {
      id: `msg_${crypto.randomUUID()}`,
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
      const stream = await streamAgent(currentThreadId, content.trim(), getModelConfig())

      for await (const event of stream) {
        handleSSEEvent(event)
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
        const responseMessage: AgentMessage = {
          id: `msg_${crypto.randomUUID()}`,
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

  if (!isOpen) return null;

  return (
    <div
      ref={windowRef}
      className={cn(
        'fixed z-50 flex flex-col overflow-hidden',
        isFullSize
          ? 'top-0 right-0 bottom-0 rounded-none border-0 shadow-none md:left-[16rem] md:[html.sidebar-collapsed_&]:left-[92px]'
          : 'rounded-lg border border-border/50 shadow-2xl bg-background dark:bg-popover'
      )}
      style={{
        ...(isFullSize
          ? {}
          : {
              left: position.x,
              top: position.y,
              width: size.width,
              height: size.height,
            }),
      }}
      role="dialog"
      aria-label="Agent 助手浮窗"
    >
      <div
        className={cn(
          'flex items-center justify-between px-3 py-2 border-b border-border/50 bg-muted/30 shrink-0 select-none',
          !isFullSize && 'cursor-grab',
          !isFullSize && 'active:cursor-grabbing'
        )}
        onMouseDown={handleDragStart}
      >
        <div className="flex items-center gap-2">
          <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground/60" />
          <Bot className="h-4 w-4" />
          <span className="text-xs font-semibold">Agent 助手</span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7"
            onClick={handleFullSizeToggle}
            aria-label={isFullSize ? '还原窗口' : '最大化'}
          >
            {isFullSize ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            className="h-7 w-7"
            onClick={onClose}
            aria-label="关闭 Agent"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <div className="shrink-0 border-b border-border/50 bg-background/50 dark:border-popover/30">
          <ThreadList
            threads={threads}
            currentThreadId={currentThreadId}
            unreadCounts={{}}
            onThreadSelect={setCurrentThread}
            onThreadDelete={deleteThread}
            onThreadRename={updateThreadTitle}
            onNewThread={createThread}
          />
        </div>

        <ScrollArea className="flex-1 min-h-0 p-4">
          {currentPhase === 'thinking' && (
            <ThinkingPanel
              phase={currentPhase}
              onCancel={() => {
                setPhase('idle');
                setLoading(false);
              }}
            />
          )}

          <div className="space-y-3">
            {currentMessages.map((message, idx) => (
              <MessageBubble
                key={message.id}
                message={message}
                isLast={idx === currentMessages.length - 1}
              />
            ))}

            {isLoading && currentPhase === 'thinking' && (
              <div className="flex items-center justify-center py-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Bot className="h-3 w-3 animate-pulse" />
                  <span>AI 正在思考中...</span>
                </div>
              </div>
            )}

            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50/20 border border-red-50/50 rounded-lg text-sm">
                <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
                <span>{error}</span>
              </div>
            )}
          </div>
        </ScrollArea>

        <InputBar
          isLoading={isLoading}
          hasError={!!error}
          onSend={handleSendMessage}
          onQuickAction={handleQuickAction}
          selectedText={selectedText}
          onClearSelectedText={() => setSelectedText(null)}
        />
      </div>

      {!isFullSize && (
        <>
          <div
            className="absolute left-0 top-0 w-3 h-3 cursor-nwse-resize z-10"
            onMouseDown={(e) => handleResizeStart(e, 'nw')}
          />
          <div
            className="absolute left-0 top-3 bottom-3 z-10 cursor-w-resize"
            style={{ width: EDGE_RESIZE_WIDTH }}
            onMouseDown={(e) => handleResizeStart(e, 'w')}
          />
          <div
            className="absolute left-3 right-3 top-0 z-10 cursor-n-resize"
            style={{ height: EDGE_RESIZE_WIDTH }}
            onMouseDown={(e) => handleResizeStart(e, 'n')}
          />
        </>
      )}
    </div>
  );
}
