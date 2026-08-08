'use client';

import { useEffect, useState } from 'react';
import { FlipCard } from '@/shared/ui/FlipCard';
import type { Card } from '@/shared/api/wizard';

interface CardGridProps {
  cards: Card[];
  step: string;
  editable?: boolean;
  selectable?: boolean;
  selectedIndex?: number;
  onSelect?: (index: number) => void;
  onEdit?: (index: number, card: Card) => void;
  onRemove?: (index: number) => void;
  confirmed?: boolean;
}

const STAGGER_DELAY = 120;

export function CardGrid({
  cards, step, editable, selectable, selectedIndex,
  onSelect, onEdit, onRemove, confirmed,
}: CardGridProps) {
  const [visible, setVisible] = useState<Set<number>>(new Set());

  // 卡片清空时立即复位（渲染期间调整，React 会立即重渲染）
  if (cards.length === 0 && visible.size !== 0) {
    setVisible(new Set());
  }

  // 卡片逐张交错显现（异步 setTimeout 内 setState，不影响渲染期间规则）
  useEffect(() => {
    if (cards.length === 0) return;
    cards.forEach((_, idx) => {
      setTimeout(() => {
        setVisible((prev) => new Set([...prev, idx]));
      }, idx * STAGGER_DELAY);
    });
  }, [cards]);

  if (cards.length === 0) return null;

  return (
    <div className="flex justify-center gap-4 py-6 flex-nowrap">
      {cards.map((card, i) => (
        <div
          key={`${card.title}-${i}`}
          className="transition-all duration-400 ease-out flex-shrink-0"
          style={{
            opacity: visible.has(i) ? 1 : 0,
            transform: visible.has(i) ? 'scale(1)' : 'scale(0.92)',
            transitionTimingFunction: 'cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <FlipCard
            card={card}
            index={i}
            total={cards.length}
            step={step}
            editable={editable}
            selected={selectable ? selectedIndex === i : undefined}
            onSelect={selectable ? () => onSelect?.(i) : undefined}
            onEdit={onEdit}
            onRemove={onRemove}
            confirmed={confirmed}
          />
        </div>
      ))}
    </div>
  );
}
