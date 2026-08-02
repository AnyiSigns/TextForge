'use client';

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useBookDetailStore } from '../store';

const CARD_LABELS: Record<string, string> = {
  world_setup: '世界观设定',
  plot_direction: '故事走向',
  character_intro: '角色',
  location_card: '地点',
  foreshadow_card: '伏笔',
  char_dialogue: '角色对话模拟',
  custom: '自定义',
};

interface ProposeCardsProps {
  data: Record<string, unknown>;
}

export function ProposeCards({ data }: ProposeCardsProps) {
  const openCardDraw = useBookDetailStore((s) => s.openCardDraw);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const cardTypes = (data.card_types as string[]) || [];
  const reason = String(data.reason || '');
  const cards = (data.cards as Array<{ id?: string; card_type?: string; title?: string; description?: string }>) || [];

  return (
    <div className="mx-1 my-2 p-3 rounded-lg border border-foreground/10 bg-card">
      <div className="text-xs font-semibold mb-1">AI 创作建议</div>
      {reason && <div className="text-[11px] text-muted-foreground mb-2">{reason}</div>}
      <div className="space-y-1">
        {cards.map((card, i) => {
          const type = card.card_type || cardTypes[i] || 'custom';
          const label = CARD_LABELS[type] || type;
          const cardId = card.id || String(i);
          const isExpanded = expandedCard === cardId;
          return (
            <div key={cardId}>
              <div
                onClick={() => { setExpandedCard(isExpanded ? null : cardId); openCardDraw(); }}
                className={cn(
                  'flex items-center gap-2 p-2 rounded-md cursor-pointer hover:bg-[var(--sidebar-hover)] transition-colors text-[13px]',
                  isExpanded && 'bg-[var(--sidebar-hover)]',
                )}
                role="button"
                tabIndex={0}
              >
                <ChevronRight size={12} className={cn('text-muted-foreground shrink-0 transition-transform', isExpanded && 'rotate-90')} />
                <span className="bg-muted px-1.5 py-0.5 rounded text-[10px] text-muted-foreground shrink-0">{label}</span>
                <span className="flex-1 truncate font-medium">{card.title || '创作建议'}</span>
              </div>
              {isExpanded && card.description && (
                <div className="ml-7 pl-3 border-l border-border text-[11px] text-muted-foreground py-1">
                  {card.description}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
