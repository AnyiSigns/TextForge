'use client';

import React from 'react';
import type { Location } from '@/shared/api/types';
import { cn } from '@/shared/lib/cn';

const TYPE_ICONS: Record<string, string> = {
  '宇宙空间': '\u2606',
  '星系': '\u2738',
  '行星': '\u25CF',
  '大陆': '\u25A0',
  '城市': '\u2606',
  '城镇': '\u25C7',
  '建筑': '\u2302',
  '房间': '\u25A3',
  '星域': '\u2726',
};

interface LocationMarkerProps {
  location: Location;
  x: number;
  y: number;
  hasChildren: boolean;
  onClick: () => void;
  isSelected?: boolean;
  characterCount?: number;
  onEdit?: () => void;
}

export function LocationMarker({
  location,
  x,
  y,
  hasChildren,
  onClick,
  isSelected = false,
  characterCount = 0,
  onEdit,
}: LocationMarkerProps) {
  const icon = TYPE_ICONS[location.type] ?? '\u25C7';
  const hasPosition = location.positionX !== null && location.positionY !== null;

  return (
    <div
      className={cn(
        'absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer group',
        hasChildren && 'cursor-pointer',
        !hasChildren && !location.backgroundUrl && 'cursor-default',
      )}
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transition: 'left 0.4s ease-out, top 0.4s ease-out',
      }}
      onClick={onClick}
    >
      <div
        className={cn(
          'flex flex-col items-center gap-1 px-3 py-2 rounded-xl transition-all duration-200',
          'bg-card/85 backdrop-blur-sm border border-border/60 shadow-sm',
          'hover:bg-card hover:border-foreground/20 hover:shadow-md',
          isSelected && 'border-foreground/40 shadow-md bg-card/95',
          !hasPosition && 'border-dashed',
        )}
      >
        <span className="text-sm text-foreground/60">{icon}</span>
        <span className="text-xs font-medium text-foreground/80 whitespace-nowrap max-w-[100px] truncate">
          {location.name}
        </span>
        <span className="text-[10px] text-muted-foreground/60">{location.type}</span>
        {characterCount > 0 && (
          <span className="text-[10px] text-muted-foreground/80 mt-0.5">
            {characterCount} 位角色
          </span>
        )}
        {hasChildren && (
          <span className="text-[10px] text-muted-foreground/40 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            点击进入
          </span>
        )}
        {/* 编辑按钮 */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit?.();
          }}
          className="absolute -top-1 -right-1 w-5 h-5 flex items-center justify-center rounded-full bg-card border border-border/60 text-muted-foreground/50 hover:text-foreground/70 hover:border-foreground/20 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
          title="编辑"
        >
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
