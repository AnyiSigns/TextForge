'use client';

import { cn } from '@/shared/lib/cn';
import type { MockCharacter } from '@/mocks/data';

interface CharacterAvatarProps {
  character: MockCharacter;
  x: number;
  y: number;
  isSelected: boolean;
  onClick: () => void;
}

export function CharacterAvatar({ character, x, y, isSelected, onClick }: CharacterAvatarProps) {
  const initials = character.name.slice(0, 2);

  return (
    <div
      className={cn(
        'absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer z-20 group',
      )}
      style={{
        left: `${x * 100}%`,
        top: `${y * 100}%`,
        transition: 'left 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), top 0.6s cubic-bezier(0.34, 1.56, 0.64, 1)',
      }}
      onClick={(e) => { e.stopPropagation(); onClick(); }}
    >
      <div
        className={cn(
          'w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold transition-all duration-200',
          'border-2 shadow-sm',
          isSelected
            ? 'bg-foreground text-background border-foreground scale-110'
            : 'bg-card/90 text-foreground/70 border-border/60 hover:border-foreground/30 hover:scale-105',
        )}
      >
        {initials}
      </div>
      {/* 名称标签 */}
      <div
        className={cn(
          'absolute top-full mt-1 left-1/2 -translate-x-1/2 whitespace-nowrap',
          'text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity',
          isSelected ? 'text-foreground/90' : 'text-muted-foreground/70',
        )}
      >
        {character.name}
      </div>
    </div>
  );
}
