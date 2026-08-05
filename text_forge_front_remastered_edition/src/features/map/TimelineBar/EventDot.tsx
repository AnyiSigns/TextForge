'use client';

import { useMemo } from 'react';
import { cn } from '@/shared/lib/cn';
import type { SceneEvent } from '@/shared/api/types';

interface EventDotProps {
  event: SceneEvent;
  x: number;
  isSelected: boolean;
  isActive: boolean;
  onClick: () => void;
}

const TYPE_CONFIG = {
  milestone: { size: 8, ring: true, color: 'bg-foreground/80' },
  scene: { size: 6, ring: false, color: 'bg-foreground/60' },
  event: { size: 5, ring: false, color: 'bg-foreground/40' },
};

export function EventDot({ event, x, isSelected, isActive, onClick }: EventDotProps) {
  const config = useMemo(() => TYPE_CONFIG[event.eventType] ?? TYPE_CONFIG.event, [event.eventType]);

  return (
    <div
      className={cn('absolute top-1/2 -translate-y-1/2 z-10 cursor-pointer group')}
      style={{ left: x, marginLeft: -config.size / 2 }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      {/* 标签 */}
      <div
        className={cn(
          'absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap',
          'text-[10px] font-medium transition-all duration-150',
          isSelected
            ? 'text-foreground/90 opacity-100'
            : 'text-muted-foreground/70 opacity-0 group-hover:opacity-100',
        )}
      >
        <span className="bg-card/95 backdrop-blur-sm px-2 py-0.5 rounded-md border border-border/50 shadow-sm">
          {event.storyLabel ?? event.title}
        </span>
        {/* 三角箭头 */}
        <div className="mx-auto w-1.5 h-1.5 bg-card/95 border-b border-r border-border/50 transform rotate-45 -mt-0.5" />
      </div>

      {/* 点标记 */}
      <div
        className={cn(
          'rounded-full transition-all duration-200',
          config.ring ? 'flex items-center justify-center' : '',
          isActive ? config.color : 'bg-muted-foreground/20',
          isSelected && 'ring-2 ring-foreground/40 scale-125',
        )}
        style={{ width: config.size, height: config.size }}
      >
        {config.ring && (
          <div
            className={cn(
              'rounded-full',
              isActive ? 'bg-foreground/90' : 'bg-muted-foreground/40',
            )}
            style={{ width: config.size * 0.5, height: config.size * 0.5 }}
          />
        )}
      </div>
    </div>
  );
}
