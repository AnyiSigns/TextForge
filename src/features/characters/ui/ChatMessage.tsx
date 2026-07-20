'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { Message } from '@/types';
import { useAuthStore } from '@/lib/stores/authStore';

interface Props {
  message: Message;
  characterName: string;
  characterAvatar?: string;
  isLoading?: boolean;
  prevTimestamp?: string;
  /** 气泡背景独立透明度（0–1），让对话区背景可透出 */
  bubbleOpacity?: number;
}

const FIVE_MIN = 5 * 60 * 1000;

function formatTime(ts: string): string {
  const d = new Date(ts);
  const now = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const isSameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (isSameDay(d, now)) return hm;

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (isSameDay(d, yesterday)) return `昨天 ${hm}`;

  if (d.getFullYear() === now.getFullYear()) return `${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${hm}`;
}

export function ChatMessage({ message: msg, characterName, characterAvatar, isLoading, prevTimestamp, bubbleOpacity = 0.85 }: Props) {
  const isUser = msg.role === 'user';
  const user = useAuthStore((s) => s.user);
  const userInitial = (user?.username || '我').slice(0, 2);
  const charName = characterName ?? '';
  const showTime =
    !prevTimestamp ||
    new Date(msg.timestamp).getTime() - new Date(prevTimestamp).getTime() > FIVE_MIN;

  return (
    <>
      {showTime && (
        <div className="w-full flex justify-center my-2">
          <span className="text-[10px] text-muted-foreground/70 bg-foreground/5 px-2 py-0.5 rounded-full">
            {formatTime(msg.timestamp)}
          </span>
        </div>
      )}
      <div className={cn('flex gap-3 animate-in fade-in slide-in-from-bottom-2 duration-200', isUser && 'flex-row-reverse')}>
        {isUser ? (
          <Avatar className="w-8 h-8 shrink-0">
            <AvatarImage src={user?.avatar} />
            <AvatarFallback className="text-xs">{userInitial}</AvatarFallback>
          </Avatar>
        ) : (
          <Avatar className="w-8 h-8 shrink-0">
            <AvatarImage src={characterAvatar} />
            <AvatarFallback className="text-xs">{charName.slice(0, 2)}</AvatarFallback>
          </Avatar>
        )}
        <div className={cn(
          'max-w-[70%] rounded-2xl px-4 py-2.5 text-sm',
          isUser ? 'bg-primary text-primary-foreground border border-primary/30' : 'bg-muted text-foreground border border-border/40',
        )}
        style={{ backgroundColor: `hsl(var(${isUser ? 'primary' : 'muted'}) / ${bubbleOpacity})` }}
        >
          {msg.content || (!isUser && isLoading && '...')}
          {msg.emoji && <span className="ml-1">{msg.emoji}</span>}
        </div>
      </div>
    </>
  );
}
