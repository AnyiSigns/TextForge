'use client';

import { useState, useCallback } from 'react';
import { ChevronRight, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/cn';
import { useBookDetailStore } from '../store';
import * as booksApi from '@/shared/api/books';
import * as charactersApi from '@/shared/api/characters';
import * as worldApi from '@/shared/api/world';

const CARD_LABELS: Record<string, string> = {
  world_setup: '世界观设定',
  plot_direction: '故事走向',
  character_intro: '角色',
  location_card: '地点',
  foreshadow_card: '伏笔',
  char_dialogue: '角色对话模拟',
  custom: '自定义',
};

interface CardProposal {
  id?: string;
  card_type?: string;
  title?: string;
  description?: string;
}

interface ProposeCardsProps {
  data: Record<string, unknown>;
}

export function ProposeCards({ data }: ProposeCardsProps) {
  const openCardDraw = useBookDetailStore((s) => s.openCardDraw);
  const setCreativePhase = useBookDetailStore((s) => s.setCreativePhase);
  const bookId = useBookDetailStore((s) => s.bookId);
  const loadCharacters = useBookDetailStore((s) => s.loadCharacters);
  const loadWorld = useBookDetailStore((s) => s.loadWorld);
  const loadChapters = useBookDetailStore((s) => s.loadChapters);
  const loadCreativeSetting = useBookDetailStore((s) => s.loadCreativeSetting);

  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [executingId, setExecutingId] = useState<string | null>(null);
  const cardTypes = (data.card_types as string[]) || [];
  const reason = String(data.reason || '');
  const cards = (data.cards as CardProposal[]) || [];

  const executeCard = useCallback(async (card: CardProposal, index: number) => {
    const type = card.card_type || cardTypes[index] || 'custom';
    const title = card.title || '创作建议';
    const summary = card.description || '';
    const cardId = card.id || String(index);
    if (type !== 'char_dialogue' && !summary.trim()) {
      toast.error('提案内容为空，无法执行');
      return;
    }
    setExecutingId(cardId);
    try {
      switch (type) {
        // 世界观设定：写入 CreativeSetting
        case 'world_setup': {
          await booksApi.updateCreativeSetting(bookId, { worldview: summary, tone: summary });
          await loadCreativeSetting();
          setCreativePhase('worldbuilding');
          toast.success('世界观设定已保存');
          break;
        }
        // 角色介绍：创建 Character
        case 'character_intro': {
          await charactersApi.createCharacter({ bookId, name: title, description: summary, roleType: '主角' });
          await loadCharacters();
          setCreativePhase('worldbuilding');
          toast.success('角色已创建');
          break;
        }
        // 地点卡片：创建 Location
        case 'location_card': {
          await worldApi.createLocation({ bookId, name: title, description: summary, type: '场景', attributes: {}, locked: false });
          await loadWorld();
          setCreativePhase('worldbuilding');
          toast.success('地点已创建');
          break;
        }
        // 故事走向：创建 Volume + Chapter
        case 'plot_direction': {
          const volumes = await booksApi.fetchVolumes(bookId);
          if (volumes.length === 0) {
            const vol = await booksApi.createVolume(bookId, title || '第一卷', summary);
            await booksApi.createChapter(vol.id, '第一章', summary || title);
          } else {
            const lastVol = volumes[volumes.length - 1];
            await booksApi.createChapter(lastVol.id, title || '新章节', summary || title);
          }
          await loadChapters();
          setCreativePhase('outlining');
          toast.success('章节已创建');
          break;
        }
        // 伏笔：创建 Foreshadowing
        case 'foreshadow_card': {
          await worldApi.createForeshadowing({ bookId, description: summary || title, status: 'planted', relatedCharacterIds: [], locked: false });
          await loadWorld();
          toast.success('伏笔已创建');
          break;
        }
        // 角色对话：打开抽卡创作面板
        case 'char_dialogue': {
          openCardDraw();
          break;
        }
        default:
          toast.info('暂不支持此卡片类型的自动执行');
      }
    } catch {
      toast.error('执行失败，请重试');
    } finally {
      setExecutingId(null);
    }
  }, [bookId, loadCharacters, loadWorld, loadChapters, loadCreativeSetting, openCardDraw, setCreativePhase]);

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
          const isExecuting = executingId === cardId;
          return (
            <div key={cardId}>
              <div
                onClick={() => setExpandedCard(isExpanded ? null : cardId)}
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
                <button
                  onClick={(e) => { e.stopPropagation(); void executeCard(card, i); }}
                  disabled={isExecuting}
                  className={cn('shrink-0 h-6 px-2 rounded text-[10px] font-medium border-none cursor-pointer transition-opacity flex items-center gap-1', isExecuting ? 'opacity-50' : 'opacity-80 hover:opacity-100 bg-foreground text-background')}
                >
                  <Wand2 size={10} /> {isExecuting ? '执行中' : '执行'}
                </button>
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
