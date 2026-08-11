'use client';

/**
 * 角色模拟：单条消息气泡（从 SimRoom.tsx 内联消息渲染抽离）。
 * 场景 / AI 角色发言 / 用户发言三种样式。
 */
import { Loader2 } from 'lucide-react';
import type { SimRoomMessage } from '@/shared/api/simRooms';

// 从角色名取首字作为头像占位文本。
function initials(name: string): string {
  return name.trim().slice(0, 2) || '?';
}

interface ChatMessageProps {
  message: SimRoomMessage;
  avatarUrl: string | null;
}

export function ChatMessage({ message, avatarUrl }: ChatMessageProps) {
  const isScene = message.senderType === 'system' && (message.senderLabel === '场景' || message.messageType === 'scene');
  if (isScene) {
    return (
      <div className="flex justify-center">
        <div className="max-w-[85%] text-center">
          <div className="inline-block px-4 py-2 rounded-xl bg-muted/30 text-[12px] leading-relaxed text-foreground/50 italic border-l-2 border-r-2 border-border/30 whitespace-pre-line">
            {message.content || (
              <span className="inline-flex items-center gap-1 text-muted-foreground/60 not-italic">
                <Loader2 size={11} className="animate-spin" />
                场景生成中…
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }
  if (message.senderType === 'system') {
    // AI 角色发言：用角色头像 + 角色名
    return (
      <div className="flex gap-2">
        <div className="w-7 h-7 rounded-full bg-muted/60 flex items-center justify-center flex-shrink-0 mt-0.5 overflow-hidden text-[10px] text-foreground/60">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={message.senderLabel}
              className="w-full h-full rounded-full object-cover"
            />
          ) : (
            initials(message.senderLabel)
          )}
        </div>
        <div className="max-w-[80%]">
          <span className="text-[10px] font-medium text-foreground/50 block mb-0.5">
            {message.senderLabel}
          </span>
          <div className="px-3 py-2 rounded-2xl rounded-bl-md text-[13px] leading-relaxed bg-muted/40 text-foreground/75 whitespace-pre-line">
            {message.content || (
              <span className="inline-flex items-center gap-1 text-muted-foreground/60">
                <Loader2 size={11} className="animate-spin" />
                生成中…
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }
  // 用户消息（我的身份）：右侧 + 角色头像/名字
  return (
    <div className="flex gap-2 justify-end">
      <div className="max-w-[80%]">
        <span className="text-[10px] font-medium text-foreground/50 block mb-0.5 text-right">
          {message.senderLabel}
        </span>
        <div className="px-3 py-2 rounded-2xl rounded-br-md text-[13px] leading-relaxed bg-foreground/[0.08] text-foreground/80 whitespace-pre-line">
          {message.content}
        </div>
      </div>
      <div className="w-7 h-7 rounded-full bg-foreground/[0.06] flex items-center justify-center flex-shrink-0 mt-0.5 overflow-hidden text-[10px] text-foreground/60">
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={message.senderLabel}
            className="w-full h-full rounded-full object-cover"
          />
        ) : (
          initials(message.senderLabel)
        )}
      </div>
    </div>
  );
}
