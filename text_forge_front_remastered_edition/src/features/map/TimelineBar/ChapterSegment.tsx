'use client';

import { cn } from '@/shared/lib/cn';

interface ChapterSegmentProps {
  label: string;
  xStart: number;
  xEnd: number;
  isEmpty: boolean;
  onClick?: () => void;
}

export function ChapterSegment({ label, xStart, xEnd, isEmpty, onClick }: ChapterSegmentProps) {
  const minWidth = 40;
  const width = isEmpty ? minWidth : Math.max(xEnd - xStart, minWidth);

  return (
    <div
      className={cn(
        'absolute top-3 bottom-5 flex items-center justify-center transition-colors',
        isEmpty ? 'border-dashed' : 'border-border/40',
        !isEmpty && onClick ? 'cursor-pointer hover:bg-foreground/[0.03]' : 'cursor-default',
      )}
      style={{
        left: xStart,
        width,
      }}
      onClick={onClick}
    >
      <div
        className={cn(
          'h-full w-full rounded-md border flex items-center justify-center',
          isEmpty
            ? 'border-dashed border-border/30 bg-transparent'
            : 'border-border/20 bg-foreground/[0.02]',
        )}
      >
        <span
          className={cn(
            'text-[10px] truncate px-1',
            isEmpty
              ? 'text-muted-foreground/30'
              : 'text-muted-foreground/70',
          )}
        >
          {label}
        </span>
      </div>
    </div>
  );
}
