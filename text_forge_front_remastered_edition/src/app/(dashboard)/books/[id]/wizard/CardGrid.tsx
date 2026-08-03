'use client';

import { useEffect, useRef, useState } from 'react';
import { FlipCard } from './FlipCard';
import { cn } from '@/shared/lib/cn';
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
  const prevCount = useRef(-1);
  const [visible, setVisible] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (cards.length === 0) {
      prevCount.current = -1;
      setVisible(new Set());
      return;
    }
    const startIdx = prevCount.current === -1 ? 0 : prevCount.current;
    const newCards = cards.slice(startIdx);
    if (newCards.length === 0) return;
    prevCount.current = cards.length;
    newCards.forEach((_, offset) => {
      const idx = startIdx + offset;
      setTimeout(() => {
        setVisible((prev) => new Set([...prev, idx]));
      }, offset * STAGGER_DELAY);
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
