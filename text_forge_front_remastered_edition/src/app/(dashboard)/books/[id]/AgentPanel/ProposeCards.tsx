'use client';

import { useState, useCallback, useMemo } from 'react';
import { ChevronRight, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
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

interface CardProposal {
  id?: string;
  card_type?: string;
  title?: string;
  description?: string;
}

interface ProposeCardsProps {
  data: Record<string, unknown>;
  /** 任务 32：写库类卡片改走 agent 消息（过 supervisor 路由 + 门控），由父面板注入 */
  onSendMessage?: (msg: string) => void;
}

export function ProposeCards({ data, onSendMessage }: ProposeCardsProps) {
  const openCardDraw = useBookDetailStore((s) => s.openCardDraw);
  const setCreativePhase = useBookDetailStore((s) => s.setCreativePhase);
  const agentStreaming = useBookDetailStore((s) => s.agentStreaming);

  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const cardTypes = useMemo(() => (data.card_types as string[]) || [], [data.card_types]);
  const reason = String(data.reason || '');
  const cards = (data.cards as CardProposal[]) || [];

  /** 把卡片内容转成自然语言创作指令，发给 agent 走对应子图（过门控），不再直连 API 绕过门控。 */
  const sendToAgent = useCallback((instruction: string): boolean => {
    // 流式进行中 sendMessage 会静默丢弃指令，这里显式提示，避免「点了没反应还推进阶段徽标」
    if (agentStreaming) {
      toast.info('AI 助手正在执行中，请稍后再试');
      return false;
    }
    if (onSendMessage) {
      onSendMessage(instruction);
      return true;
    }
    toast.info('请先打开 AI 助手面板执行');
    return false;
  }, [agentStreaming, onSendMessage]);

  const executeCard = useCallback((card: CardProposal, index: number) => {
    const type = card.card_type || cardTypes[index] || 'custom';
    const title = card.title || '创作建议';
    const summary = card.description || '';
    if (type !== 'char_dialogue' && !summary.trim()) {
      toast.error('提案内容为空，无法执行');
      return;
    }
    switch (type) {
      // 世界观设定：发 agent 走 worldbuilding 子图（update_entity/creative_setting），过门控
      case 'world_setup': {
        if (sendToAgent(`请将以下世界观设定写入当前书籍的创作设定（creative_setting）：${title}。\n${summary}`)) {
          setCreativePhase('worldbuilding');
        }
        break;
      }
      // 角色介绍：发 agent 走 worldbuilding 子图（create_entities 创建角色），过门控
      case 'character_intro': {
        if (sendToAgent(`请创建角色「${title}」：${summary}。用 create_entities 落库。`)) {
          setCreativePhase('worldbuilding');
        }
        break;
      }
      // 地点卡片：发 agent 走 worldbuilding 子图（create_entities 创建地点），过门控
      case 'location_card': {
        if (sendToAgent(`请创建地点「${title}」：${summary}。用 create_entities 落库。`)) {
          setCreativePhase('worldbuilding');
        }
        break;
      }
      // 故事走向：发自然语言消息走 outlining 子图（过 supervisor 路由 + 门控）
      case 'plot_direction': {
        if (sendToAgent(`请根据以下故事方向为当前书籍规划/追加章节大纲（卷→章）：${title}。${summary ? `\n概要：${summary}` : ''}`)) {
          setCreativePhase('outlining');
        }
        break;
      }
      // 伏笔：发 agent 走 worldbuilding 子图（create_entities 创建伏笔），过门控
      case 'foreshadow_card': {
        if (sendToAgent(`请创建伏笔：${summary || title}。用 create_entities 落库。`)) {
          setCreativePhase('worldbuilding');
        }
        break;
      }
      // 角色对话：打开抽卡创作面板（非写库操作，保留直连）
      case 'char_dialogue': {
        openCardDraw();
        break;
      }
      default:
        toast.info('暂不支持此卡片类型的自动执行');
    }
  }, [openCardDraw, setCreativePhase, cardTypes, sendToAgent]);

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
                  onClick={(e) => { e.stopPropagation(); executeCard(card, i); }}
                  className="shrink-0 h-6 px-2 rounded text-[10px] font-medium border-none cursor-pointer transition-opacity flex items-center gap-1 opacity-80 hover:opacity-100 bg-foreground text-background"
                >
                  <Wand2 size={10} /> 执行
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
