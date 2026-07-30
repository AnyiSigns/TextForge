// src/features/user-agent/ui/InputBar.tsx
// 底部输入栏：自适应高度 Textarea + 发送按钮 + 快捷操作按钮

'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Send, 
  Paperclip, 
  Mic, 
  Smile, 
  Settings,
  Zap,
  Search,
  FileText,
  User,
  Image,
  Loader2
} from 'lucide-react';
import { 
  Button 
} from '@/components/ui/button';
import { 
  Textarea 
} from '@/components/ui/textarea';
import { 
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useAgentStore } from '@/features/user-agent/stores/agentStore';

interface InputBarProps {
   className?: string;
  onSend?: (content: string) => void;
  onAttachment?: () => void;
  onVoice?: () => void;
  onEmoji?: () => void;
  onSettings?: () => void;
  onQuickAction?: (action: string) => void;
  disabled?: boolean;
  isLoading?: boolean;
  hasError?: boolean;
  selectedText?: string | null;
  onClearSelectedText?: () => void;
  placeholder?: string;
  maxHeight?: number;
}

export function InputBar({ 
  className = '',
  onSend,
  onAttachment,
  onVoice,
  onEmoji,
  onSettings,
  disabled = false,
  placeholder = '给 Agent 发送消息... (Enter 发送，Shift+Enter 换行)',
  maxHeight = 200
}: InputBarProps) {
  const [value, setValue] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const quickActionsRef = useRef<HTMLDivElement>(null);
  
  const { 
    currentThreadId, 
    isLoading, 
    error,
    setSelectedText 
  } = useAgentStore();
  
  // 自动调整高度
  const adjustHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(textareaRef.current.scrollHeight, maxHeight);
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, [maxHeight]);
  
  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);
  
  // 处理输入
  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
  };
  
  // 处理键盘事件
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };
  
  // 提交消息
  const handleSubmit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled || isLoading) return;
    
    onSend?.(trimmed);
    setValue('');
    // 重置高度
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };
  
  // 快捷操作
  const quickActions = [
    { 
      id: 'continue', 
      label: '续写本章', 
      icon: Zap, 
      prompt: '请根据上下文继续写本章内容' 
    },
    { 
      id: 'check', 
      label: '检查选中', 
      icon: Search, 
      prompt: '请检查选中文字的一致性、逻辑和文采' 
    },
    { 
      id: 'context', 
      label: '查上下文', 
      icon: FileText, 
      prompt: '请总结前文关键情节和角色状态' 
    },
    { 
      id: 'persona', 
      label: '人设', 
      icon: User, 
      prompt: '请根据角色设定优化选中文字' 
    },
  ];
  
  const handleQuickAction = (action: typeof quickActions[0]) => {
    // 如果有选中文本，包含在提示中
    const selectedText = window.getSelection()?.toString().trim();
    let fullPrompt = action.prompt;
    if (selectedText) {
      fullPrompt += `：\n\n${selectedText}`;
    }
    
    // 清除选中文本状态
    setSelectedText(null);
    
    onSend?.(fullPrompt);
    setShowQuickActions(false);
  };
  
  // 点击外部关闭下拉菜单
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (quickActionsRef.current && !quickActionsRef.current.contains(e.target as Node)) {
        setShowQuickActions(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  if (!currentThreadId) {
    return (
      <div className={cn(
        'flex items-center gap-2 px-3 py-2 border-t border-border/50',
        className
      )}>
        <div className="flex-1 text-center py-4 text-xs text-muted-foreground">
          请先在左侧新建或选择一个对话线程
        </div>
      </div>
    );
  }
  
  return (
    <TooltipProvider>
      <div className={cn(
        'flex flex-col gap-2 px-3 py-2 border-t border-border/50 bg-background/95 backdrop-blur-sm',
        className
      )}>
        {/* 快捷操作栏 */}
        <TooltipProvider>
          <div className={cn(
            'flex items-center gap-1 overflow-x-auto pb-1 scrollbar-hide',
            showQuickActions ? 'animate-slide-in' : 'hidden'
          )} ref={quickActionsRef}>
{quickActions.map((action) => (
                <Tooltip key={action.id}>
                  <TooltipTrigger>
                    <Button
                      variant="outline"
                      size="sm"
                      className={cn(
                        'h-7 px-2 text-xs whitespace-nowrap gap-1',
                        'hover:bg-primary/10 border-primary/20'
                      )}
                      onClick={() => handleQuickAction(action)}
                    >
                      <action.icon className="h-3 w-3" />
                      {action.label}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{action.label}</TooltipContent>
                </Tooltip>
              ))}
          </div>
        </TooltipProvider>
        
        {/* 主输入区 */}
        <div className="flex items-end gap-2">
          {/* 附件/语音/表情/快捷操作 */}
          <div className="flex items-center gap-1">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={onAttachment}
                    disabled={disabled || isLoading}
                  >
                    <Paperclip className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>添加附件</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={onVoice}
                    disabled={disabled || isLoading}
                  >
                    <Mic className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>语音输入</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                    disabled={disabled || isLoading}
                  >
                    <Smile className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>表情符号</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowQuickActions(!showQuickActions)}
                    disabled={disabled || isLoading}
                  >
                    <Zap className="h-4 w-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>快捷操作</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          
          {/* 文本输入框 */}
          <div className="flex-1 relative">
            <Textarea
              ref={textareaRef}
              value={value}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled || isLoading}
              className={cn(
                'min-h-[44px] max-h-[200px] pr-12 resize-none',
                'bg-background border-border/50 focus:border-primary/50'
              )}
              rows={1}
            />
            {/* 字符计数 */}
            {value.length > 100 && (
              <div className="absolute bottom-1 right-8 text-[10px] text-muted-foreground/60">
                {value.length}/10000
              </div>
            )}
          </div>
          
          {/* 发送按钮 */}
<TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <Button
                  size="icon"
                  className={cn(
                    'h-8 w-8 rounded-full transition-all',
                    isLoading 
                      ? 'bg-muted text-muted-foreground cursor-not-allowed' 
                      : 'bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50'
                  )}
                  onClick={handleSubmit}
                  disabled={disabled || isLoading || !value.trim()}
                  aria-label="发送消息"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{isLoading ? '正在处理中...' : '发送 (Enter)'}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </TooltipProvider>
  );
}