// src/app/(dashboard)/characters/[id]/chat/CharacterChatMessages.tsx
'use client';

import { forwardRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Send } from 'lucide-react';
import { ChatMessage } from '@/features/characters';
import type { Message } from '@/types';

interface CharacterChatMessagesProps {
  name: string;
  input: string;
  messages: Message[];
  isLoading: boolean;
  onInput: (v: string) => void;
  onSend: () => void;
}

export const CharacterChatMessages = forwardRef<HTMLDivElement, CharacterChatMessagesProps>(
  function CharacterChatMessages({ name, input, messages, isLoading, onInput, onSend }, scrollRef) {
    return (
      <>
        <div ref={scrollRef} className="flex-1 min-h-0 rounded-2xl border border-border/40 bg-background/40 overflow-y-auto">
          <div className="space-y-4 px-2 py-4">
            {messages.map((msg, i) => (
              <ChatMessage
                key={msg.id}
                message={msg}
                characterName={name}
                isLoading={isLoading}
                prevTimestamp={i > 0 ? messages[i - 1].timestamp : undefined}
              />
            ))}
            {isLoading && messages.at(-1)?.role === 'user' && (
              <div className="flex gap-3">
                <Avatar className="w-8 h-8 shrink-0">
                  <AvatarFallback className="text-xs">{name.slice(0, 2)}</AvatarFallback>
                </Avatar>
                <div className="bg-muted/60 rounded-2xl px-4 py-3 flex items-center gap-1">
                  {[0, 150, 300].map(delay => (
                    <span key={delay} className="w-2 h-2 bg-foreground/30 rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="pt-4 border-t border-border/40">
          <div className="flex items-center gap-2 relative">
            <div className="relative flex-1">
              <Input
                value={input}
                onChange={e => onInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onSend()}
                placeholder={`对 ${name || '角色'} 说点什么...`}
                className="pr-12"
              />
            </div>
            <Button onClick={onSend} disabled={!input.trim() || isLoading}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </>
    );
  },
);
