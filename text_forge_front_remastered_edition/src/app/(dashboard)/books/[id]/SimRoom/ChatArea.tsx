'use client';

/**
 * 角色模拟：右侧对话区（从 SimRoom.tsx 内联抽离）。
 * 房间头部 + 消息列表 + 输入区；无活跃房间时展示空状态。
 */
import { useMemo } from 'react';
import { X, MessageCircle, List } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import type { SimRoomDetail, SimRoomMessage } from '@/shared/api/simRooms';
import type { SimSuggestion } from '@/shared/api/useSimRoom';
import type { Location } from '@/shared/api/types';
import { ChatMessage } from './ChatMessage';
import { ChatInput } from './ChatInput';

interface ChatAreaProps {
  activeRoom: SimRoomDetail | null;
  bookTitle?: string;
  locations: Location[];
  messages: SimRoomMessage[];
  suggestions: SimSuggestion[];
  streaming: boolean;
  branching: boolean;
  connected: boolean;
  roundCount: number;
  myRole: string;
  avatarByCharacter: Map<string, string | null>;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  onEnd: () => void;
  onClose: () => void;
  onSend: (content: string) => void;
  onAutoAdvance: (turns?: number) => void;
  onBranchType: (type: string) => void;
  onOpenRooms?: () => void;
}

export function ChatArea({
  activeRoom,
  bookTitle,
  locations,
  messages,
  suggestions,
  streaming,
  branching,
  connected,
  roundCount,
  myRole,
  avatarByCharacter,
  messagesEndRef,
  onEnd,
  onClose,
  onSend,
  onAutoAdvance,
  onBranchType,
  onOpenRooms,
}: ChatAreaProps) {
  // 历史用户消息的 senderLabel 是后端原样存储的 "character:<id>" / "director"，
  // 需映射为可读角色名再展示（实时消息已在 useSimRoom 本地回显为角色名，不受影响）。
  const resolvedMessages = useMemo(() => {
    if (!activeRoom) return messages;
    const roleByEntity = new Map<number, string>();
    activeRoom.participants.forEach((p) => roleByEntity.set(p.entityId, p.roleLabel));
    return messages.map((m) => {
      if (m.senderType !== 'user') return m;
      let label = m.senderLabel;
      if (label.startsWith('character:')) {
        const role = roleByEntity.get(Number(label.slice('character:'.length)));
        if (role) label = role;
      } else if (label === 'director') {
        label = myRole && myRole !== '用户' ? myRole : '导演';
      }
      return label === m.senderLabel ? m : { ...m, senderLabel: label };
    });
  }, [messages, activeRoom, myRole]);

  if (!activeRoom) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-2">
        <MessageCircle size={28} className="opacity-30" />
        <p className="text-sm">
          {bookTitle ? `《${bookTitle}》的` : ''}角色模拟
        </p>
        <p className="text-[11px] text-muted-foreground/60">
          选择或创建一个房间开始对话
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <div className="flex items-center justify-between px-4 h-12 border-b border-border/40 flex-shrink-0">
        <div className="min-w-0">
          <span className="text-sm font-medium text-foreground/85 truncate">
            {activeRoom.name}
          </span>
          {activeRoom.locationId && (
            <span className="text-[11px] text-muted-foreground ml-2 truncate">
              {locations.find((l) => l.id === activeRoom.locationId)?.name ?? ''}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-shrink-0">
          {onOpenRooms && (
            <button
              onClick={onOpenRooms}
              className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 bg-transparent border-none cursor-pointer sm:hidden"
              aria-label="房间列表"
            >
              <List size={14} strokeWidth={1.5} />
            </button>
          )}
          <span
            className={cn(
              'w-1.5 h-1.5 rounded-full',
              connected ? 'bg-foreground/70' : 'bg-muted-foreground/40',
            )}
          />
          {connected ? '已连接' : '未连接'}
          <span className="ml-1 tabular-nums">{roundCount} 轮</span>
          <button
            onClick={onEnd}
            className="h-6 px-2 rounded text-[10px] border border-border bg-transparent cursor-pointer hover:bg-foreground/[0.04] text-muted-foreground ml-2"
          >
            结束支线会话
          </button>
          <button
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-foreground/5 bg-transparent border-none cursor-pointer"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
        {resolvedMessages.map((m) => (
          <ChatMessage key={m.id} message={m} avatarUrl={avatarByCharacter.get(m.senderLabel) ?? null} />
        ))}
        <div ref={messagesEndRef} />
      </div>

      <ChatInput
        key={activeRoom.id}
        myRole={myRole}
        streaming={streaming}
        suggestions={suggestions}
        branching={branching}
        canBranch={messages.some((m) => m.senderType === 'system')}
        onSend={onSend}
        onAutoAdvance={onAutoAdvance}
        onBranchType={onBranchType}
      />
    </div>
  );
}
