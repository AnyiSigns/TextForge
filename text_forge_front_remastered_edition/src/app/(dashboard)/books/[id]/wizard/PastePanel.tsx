'use client';

import { useState } from 'react';
import { FlipCard } from './FlipCard';
import type { Card } from '@/shared/api/wizard';

interface PastePanelProps {
  onAddCards: (cards: Card[]) => void;
}

function parseToCards(text: string): Card[] {
  const cards: Card[] = [];
  const sections = text.split(/=== (.+?) ===/);

  let i = 1;
  while (i < sections.length) {
    const title = sections[i].trim();
    const body = (sections[i + 1] || '').trim();
    const fields: { key: string; value: string }[] = [];

    const lines = body.split(/\n/);
    for (const line of lines) {
      const colonIdx = line.indexOf(':');
      if (colonIdx > 0) {
        const key = line.slice(0, colonIdx).trim();
        const value = line.slice(colonIdx + 1).trim();
        if (key && value) {
          fields.push({ key, value });
        }
      }
    }

    if (title && fields.length > 0) {
      cards.push({ title, fields, card_type: 'card' });
    }

    i += 2;
  }

  return cards;
}

export function PastePanel({ onAddCards }: PastePanelProps) {
  const [text, setText] = useState('');
  const [parsedCards, setParsedCards] = useState<Card[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const handleParse = () => {
    const cards = parseToCards(text);
    setParsedCards(cards);
    setSelected(new Set());
  };

  const toggleCard = (idx: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleAddSelected = () => {
    const selectedCards = parsedCards.filter((_, i) => selected.has(i));
    if (selectedCards.length > 0) {
      onAddCards(selectedCards);
      setParsedCards([]);
      setSelected(new Set());
      setText('');
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-xs text-muted-foreground mb-2">
        粘贴 AI 对话生成的文本，格式：<br />
        <code className="text-[11px] bg-secondary rounded px-1">=== 标题 ===</code><br />
        <code className="text-[11px] bg-secondary rounded px-1">字段: 值</code>
      </div>

      <textarea
        className="w-full h-36 text-xs bg-secondary rounded-lg p-3 text-foreground resize-y border border-border focus:outline-none focus:ring-1 focus:ring-ring"
        placeholder={`=== 青云宗 ===\n类型: 仙门\n描述: 位于青云山脉主峰...\n\n=== 万宝阁 ===\n类型: 商会\n描述: 横跨三界的商业联盟...`}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />

      <div className="flex gap-2">
        <button
          onClick={handleParse}
          disabled={!text.trim()}
          className="px-4 py-1.5 text-xs rounded-lg bg-foreground text-background hover:opacity-80 disabled:opacity-40 transition-opacity"
        >
          解析预览
        </button>
      </div>

      {parsedCards.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            解析出 {parsedCards.length} 张卡片，点击选中后追加
          </div>
          <div className="flex flex-wrap gap-4 justify-center">
            {parsedCards.map((card, i) => (
              <div
                key={i}
                onClick={() => toggleCard(i)}
                className="relative cursor-pointer"
              >
                <div className={selected.has(i) ? 'ring-2 ring-foreground rounded-xl' : ''}>
                  <FlipCard
                    card={card}
                    index={i}
                    total={parsedCards.length}
                    step="paste"
                  />
                </div>
              </div>
            ))}
          </div>

          <button
            onClick={handleAddSelected}
            disabled={selected.size === 0}
            className="px-4 py-1.5 text-xs rounded-lg bg-foreground text-background hover:opacity-80 disabled:opacity-40 transition-opacity"
          >
            添加选中卡片 ({selected.size})
          </button>
        </div>
      )}
    </div>
  );
}
