'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useBookDetailStore } from '../store';
import * as agentApi from '@/shared/api/agent';
import type { SSEEvent } from '@/shared/api/types';

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  streaming?: boolean;
}

interface OutlineChatProps {
  bookId: number;
  onOutlineGenerated: () => void;
}

export function OutlineChat({ bookId, onOutlineGenerated }: OutlineChatProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async () => {
    const msg = input.trim();
    if (!msg || streaming) return;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content: msg }]);

    let tid = threadId;
    if (!tid) {
      try {
        const session = await agentApi.startAgentSession(bookId);
        tid = session.thread_id;
        setThreadId(tid);
      } catch {
        setMessages((prev) => [...prev, { role: 'assistant', content: '会话启动失败' }]);
        return;
      }
    }

    setStreaming(true);
    const abort = new AbortController();
    abortRef.current = abort;
    setMessages((prev) => [...prev, { role: 'assistant', content: '', streaming: true }]);

    try {
      await agentApi.streamAgent(
        tid,
        msg,
        (event: SSEEvent) => {
          if (event.type === 'token' && event.token) {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.streaming) {
                updated[updated.length - 1] = { ...last, content: last.content + event.token! };
              }
              return updated;
            });
          }
          if (event.type === 'end') {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              if (last && last.streaming) {
                updated[updated.length - 1] = { ...last, streaming: false };
              }
              return updated;
            });
            onOutlineGenerated();
          }
        },
        () => setStreaming(false),
        (err) => {
          setMessages((prev) => [...prev, { role: 'system', content: err }]);
          setStreaming(false);
        },
        abort.signal,
      );
    } catch {
      setStreaming(false);
    }
  }, [input, streaming, bookId, threadId, onOutlineGenerated]);

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="flex-1 overflow-y-auto space-y-3 pb-2">
        {messages.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-4">
            输入大纲需求或写作方向，AI 将辅助你规划章节结构
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={cn(
            'text-[13px] leading-relaxed',
            msg.role === 'user' ? 'text-right' : 'text-left',
            msg.role === 'system' && 'text-xs text-muted-foreground italic text-center',
          )}>
            {msg.role === 'user' ? (
              <span className="inline-block max-w-[80%] p-2.5 rounded-xl bg-muted">{msg.content}</span>
            ) : msg.role === 'assistant' ? (
              <div className={cn(
                'inline-block max-w-[85%] p-2.5 rounded-xl bg-background border border-border whitespace-pre-wrap',
                msg.streaming && 'border-foreground/20',
              )}>
                {msg.content || (msg.streaming && <span className="animate-pulse text-muted-foreground">...</span>)}
              </div>
            ) : (
              <span>{msg.content}</span>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="flex gap-1.5 pt-2 border-t border-border">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend(); } }}
          placeholder="描述大纲需求..."
          className="flex-1 h-8 px-3 rounded-md text-xs bg-background border border-border focus:outline-none"
          disabled={streaming}
        />
        <button
          onClick={() => { void handleSend(); }}
          disabled={streaming || !input.trim()}
          className="h-8 px-3 rounded-md bg-foreground text-background text-xs font-medium border-none cursor-pointer hover:opacity-90 disabled:opacity-40"
        >
          <Send size={12} />
        </button>
      </div>
    </div>
  );
}
