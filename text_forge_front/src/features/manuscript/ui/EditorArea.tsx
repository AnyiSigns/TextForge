// src/features/manuscript/ui/EditorArea.tsx
'use client';

import { cn } from '@/lib/utils';
import { GhostCursor } from './GhostCursor';

interface EditorAreaProps {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  draftContent: string;
  activeId: number | null;
  focusMode: boolean;
  streamingActive: boolean;
  streamingStalled: boolean;
  onInput: (e: React.ChangeEvent<HTMLTextAreaElement>) => void;
  onSelect: (e: React.SyntheticEvent<HTMLTextAreaElement>) => void;
  onEscape: () => void;
}

export function EditorArea({
  textareaRef, draftContent, activeId, focusMode, streamingActive, streamingStalled,
  onInput, onSelect, onEscape,
}: EditorAreaProps) {
  return (
    <div className={cn('relative h-full min-h-0 rounded-2xl border border-border/40 bg-background/40 overflow-hidden transition-all duration-200', focusMode && 'border-primary/30 bg-background/60 shadow-lg shadow-primary/5')}>
      <textarea
        ref={textareaRef}
        defaultValue={draftContent}
        key={activeId ?? 'none'}
        onChange={onInput}
        onSelect={onSelect}
        onKeyUp={(e) => { if (e.key === 'Escape') onEscape(); }}
        placeholder={focusMode ? '专注写作中…' : '在这里写作…输入 @ 选择角色，# 选择设定；选中文字可用 AI 扩写/改写/缩写'}
        className="w-full h-full overflow-y-auto overflow-x-hidden rounded-2xl border-0 bg-transparent p-4 text-base leading-relaxed outline-none resize-none font-[--font-serif,serif]"
        style={{ fontFamily: 'var(--font-serif, serif)' }}
      />
      <div className="absolute bottom-3 right-4 pointer-events-none">
        <GhostCursor active={streamingActive} stalled={streamingStalled} />
      </div>
    </div>
  );
}
