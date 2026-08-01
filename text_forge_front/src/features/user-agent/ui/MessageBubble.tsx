// src/features/user-agent/ui/MessageBubble.tsx
// 单条消息气泡组件：支持 user/assistant/tool/system 角色

'use client';

import { useState, useRef, useEffect } from 'react';
import { AgentMessage } from '@/features/user-agent/types/agent';
import { 
  Copy, 
  CheckCircle2, 
  XCircle, 
  Loader2,
  MessageSquare,
  Bot,
  Terminal,
  AlertCircle,
  Zap
} from 'lucide-react';
import { 
  Button 
} from '@/components/ui/button';
import { 
  Card, 
  CardContent 
} from '@/components/ui/card';
import { 
  ScrollArea 
} from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface MessageBubbleProps {
  message: AgentMessage;
  isLast: boolean;
  onRegenerate?: (messageId: string) => void;
  onEdit?: (messageId: string, newContent: string) => void;
}

export function MessageBubble({ message, isLast, onRegenerate, onEdit }: MessageBubbleProps) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [copied, setCopied] = useState(false);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    if (isLast) {
      messageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [isLast]);
  
  const getRoleConfig = (role: AgentMessage['role']) => {
    switch (role) {
      case 'user':
        return { icon: MessageSquare, color: 'text-primary', bg: 'bg-primary/10', label: '用户' };
      case 'assistant':
        return { icon: Bot, color: 'text-green-600', bg: 'bg-green-500/10', label: 'Agent' };
      case 'tool':
        return { icon: Terminal, color: 'text-blue-600', bg: 'bg-blue-500/10', label: `工具: ${message.toolName || '未知'}` };
      case 'system':
        return { icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-500/10', label: '系统' };
      default:
        return { icon: MessageSquare, color: 'text-muted-foreground', bg: 'bg-muted/20', label: role };
    }
  };
  
  const roleConfig = getRoleConfig(message.role);
  const Icon = roleConfig.icon;
  
const handleCopy = async () => {
   try {
     await navigator.clipboard.writeText(message.content)
     setCopied(true)
     toast.success('已复制到剪贴板')
     setTimeout(() => setCopied(false), 2000)
   } catch {
     toast.error('复制失败')
   }
 }

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content);
  
  const handleSaveEdit = () => {
    if (onEdit) {
      onEdit(message.id, editContent);
    }
    setIsEditing(false);
  };
  
  const handleRegenerate = () => {
    if (onRegenerate) {
      onRegenerate(message.id);
    }
  };
  
  const [isExpanded, setIsExpanded] = useState(false);
  
  if (message.role === 'tool') {
    return (
      <Card 
        className={cn(
          'w-full border-l-4 border-blue-500/50 transition-all',
          message.status === 'error' && 'border-red-500/50'
        )}
        ref={messageRef}
      >
        <CardContent className="p-3">
          <div className="flex items-start gap-2">
            <div className="flex-shrink-0 pt-0.5">
              <Terminal className={cn('h-4 w-4', message.status === 'error' ? 'text-red-500' : 'text-blue-500')} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 text-xs">
                <span className={cn('font-medium', message.status === 'error' ? 'text-red-500' : 'text-blue-500')}>
                  {message.toolName || '工具调用'}
                </span>
                <span className="text-muted-foreground">
                  {new Date(message.createdAt).toLocaleTimeString()}
                </span>
                {message.status === 'error' && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-100 text-red-600">
                    失败
                  </span>
                )}
                {message.status === 'completed' && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-100 text-green-600">
                    完成
                  </span>
                )}
                {message.status === 'pending' && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-100 text-amber-600">
                    进行中
                  </span>
                )}
              </div>
              
              <details className={cn('mt-2', !isExpanded && 'cursor-pointer')}>
                <summary className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                  <span>参数</span>
                  <span className="text-[10px]">({Object.keys(message.metadata?.parameters || {}).length} 项)</span>
                </summary>
                {isExpanded && (
                  <pre className="mt-1 p-2 bg-background/50 rounded text-[10px] overflow-x-auto max-h-32">
                    {JSON.stringify(message.metadata?.parameters || {}, null, 2)}
                  </pre>
                )}
              </details>
              
{(message.result || message.error) && (
                  <details className={cn('mt-2', !isExpanded && 'cursor-pointer')}>
                    <summary className="flex items-center gap-1 text-xs text-muted-foreground cursor-pointer">
                      <span>{message.error ? '错误' : '结果'}</span>
                    </summary>
                  {isExpanded && (
                    <pre className={cn(
                      'mt-1 p-2 bg-background/50 rounded text-[10px] overflow-x-auto max-h-32',
                      message.error && 'text-red-500'
                    )}>
                      {message.error || message.result}
                    </pre>
                  )}
                </details>
              )}
              
              <div className="mt-2 text-right">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="text-xs h-6 px-2"
                  onClick={() => setIsExpanded(!isExpanded)}
                >
                  {isExpanded ? '收起' : '展开'}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  return (
    <div 
      className={cn('flex gap-2 w-full', message.role === 'user' && 'flex-row-reverse')}
      ref={messageRef}
    >
      <div className="flex-1 max-w-[85%]">
        <div className="flex items-center gap-2 mb-1">
          <Icon className={cn('h-3 w-3 shrink-0', roleConfig.color)} />
          <span className="text-xs text-muted-foreground">{roleConfig.label}</span>
          <span className="text-xs text-muted-foreground/60">
            {new Date(message.createdAt).toLocaleTimeString()}
          </span>
        </div>
        
        <div 
          className={cn(
            'rounded-xl px-4 py-2',
            message.role === 'user' 
              ? 'bg-primary text-primary-foreground rounded-tr-none' 
              : 'bg-muted/30 rounded-tl-none',
            isEditing && 'outline-2 outline-offset-1 outline-primary/30'
          )}
        >
          {isEditing ? (
            <textarea
              ref={textAreaRef}
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onBlur={handleSaveEdit}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSaveEdit();
                }
                if (e.key === 'Escape') {
                  setEditContent(message.content);
                  setIsEditing(false);
                }
              }}
              className="w-full min-h-[60px] p-2 bg-transparent border rounded resize-none outline-none text-sm"
              rows={3}
            />
          ) : (
            <div 
              className={cn('prose prose-sm max-w-none', message.role === 'user' ? 'text-primary-foreground' : '')}
            >
              {message.content.split('\n').map((line, i) => (
                <p key={i} className="whitespace-pre-wrap">{line}</p>
              ))}
            </div>
          )}
        </div>
        
        {!isEditing && (
          <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
            {message.role === 'assistant' && (
              <>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-6 w-6 text-xs"
                  onClick={handleCopy}
                  title="复制"
                >
                  {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-green-500" /> : <Copy className="h-3.5 w-3.5" />}
                </Button>
                {onRegenerate && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 text-xs"
                    onClick={handleRegenerate}
                    title="重新生成"
                  >
                    <Zap className="h-3.5 w-3.5" />
                  </Button>
                )}
                {onEdit && (
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-6 w-6 text-xs"
                    onClick={() => { setEditContent(message.content); setIsEditing(true); }}
                    title="编辑"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>
      
      <div className="w-6 h-6 rounded-full bg-muted/30 shrink-0" />
    </div>
  );
}