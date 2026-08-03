'use client';

import { useState, useCallback, useRef } from 'react';
import { useWizardStore, STEP_LABELS, STEP_ORDER, hasProgress } from './store';
import { useBookDetailStore } from '../store';
import { StepNav } from './StepNav';
import { CardGrid } from './CardGrid';
import { generateCards, batchCreate } from '@/shared/api/wizard';
import type { Card, StepType, CardField } from '@/shared/api/wizard';
import { cn } from '@/shared/lib/cn';

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

export function WizardModal() {
  const store = useWizardStore();
  const bookStore = useBookDetailStore();

  const [requirements, setRequirements] = useState('');
  const [batchCreateLoading, setBatchCreateLoading] = useState(false);

  // text parse overlay
  const [showParse, setShowParse] = useState(false);
  const [parseText, setParseText] = useState('');
  const [parsedCards, setParsedCards] = useState<Card[]>([]);
  const [parseSelected, setParseSelected] = useState<Set<number>>(new Set());

  const [selectedIndex, setSelectedIndex] = useState<number>(-1);

  const abortRef = useRef<AbortController | null>(null);

  const book = bookStore.book;

  const getContext = useCallback(() => {
    const bookCtx = book ? {
      id: book.id,
      title: book.title,
      description: book.description || '',
      genre: book.genre || '',
      total_word_goal: book.totalWordGoal,
    } : { id: 0, title: '' };
    return {
      book: bookCtx,
      ...store.context,
    };
  }, [book, store.context]);

  const context = getContext();
  const bookCtxId = (context.book && 'id' in context.book) ? (context.book as { id: number }).id : bookStore.bookId;

  const step = store.currentStep;
  const isCreativeSetting = step === 'creative_setting';

  const handleGenerate = useCallback(async () => {
    store.setStreamLoading(true);
    store.setStreamError(null);
    store.setCards([]);
    setSelectedIndex(-1);

    const controller = new AbortController();
    abortRef.current = controller;

    const step = store.currentStep;
    const endpoints: Record<StepType, string> = {
      creative_setting: '/wizard/generate/creative-setting',
      locations: '/wizard/generate/locations',
      characters: '/wizard/generate/characters',
      character_relations: '/wizard/generate/character-relations',
      timeline_foreshadowing: '/wizard/generate/timeline-foreshadowing',
      plot_threads: '/wizard/generate/plot-threads',
      outline: '/wizard/generate/outline',
    };

    try {
      const body: Record<string, unknown> = { book_id: bookCtxId, context, requirements };
      if (step === 'outline') {
        const { volumeCount, chaptersPerVolume, nodesPerChapter, mode } = store.outlineSettings;
        body.volume_count = volumeCount;
        body.chapters_per_volume = chaptersPerVolume;
        body.nodes_per_chapter = nodesPerChapter;
        body.mode = mode;
      }
      if (step === 'character_relations') {
        body.characters = context.characters || [];
      }

      const parallelSteps: StepType[] = [
        'creative_setting', 'locations', 'characters',
        'timeline_foreshadowing', 'plot_threads',
      ];

      if (parallelSteps.includes(step)) {
        const variations = step === 'creative_setting' ? [
          '请提出一个偏传统经典的方案，注重宏大叙事和正道框架。',
          '请提出一个偏黑暗颠覆的方案，注重灰色地带和反套路设计。',
          '请提出一个偏轻快灵动的方案，注重轻松节奏和日常温情。',
          '请提出一个偏奇诡独特的方案，注重新颖概念和意外转折。',
        ] : ['', '', '', ''];

        const cardsAcc: (Card | null)[] = new Array(4).fill(null);

        const fetches = variations.map(async (variation, i) => {
          const bodyI: Record<string, unknown> = { ...body, batch_size: 1 };
          if (variation) (bodyI as Record<string, unknown>).variation = variation;
          try {
            const result = await generateCards(endpoints[step], bodyI);
            cardsAcc[i] = result.cards?.[0] || null;
            store.setCards(cardsAcc.filter((c): c is Card => c !== null));
          } catch {
            cardsAcc[i] = null;
            store.setCards(cardsAcc.filter((c): c is Card => c !== null));
          }
        });

        await Promise.allSettled(fetches);
        store.setStreamLoading(false);
      } else {
        const result = await generateCards(endpoints[step], body);
        store.setCards(result.cards || []);
        store.setStreamLoading(false);
      }
    } catch (err: unknown) {
      console.error('[wizard] generateCards 失败', err);
      if (err instanceof Error && err.name === 'AbortError') {
        store.setAbortedCards(store.cards);
        store.setStreamLoading(false);
      } else {
        store.setStreamError(err instanceof Error ? `${err.name}: ${err.message}` : '生成失败');
        store.setStreamLoading(false);
      }
    }
  }, [store, getContext, requirements, bookStore.bookId]);

  const handleApproveCard = useCallback((index: number, edited?: Card) => {
    store.approveCard(index, edited);
  }, [store]);

  const handleRemoveCard = useCallback((index: number) => {
    store.removeCard(index);
    if (selectedIndex === index) setSelectedIndex(-1);
    else if (selectedIndex > index) setSelectedIndex(selectedIndex - 1);
  }, [store, selectedIndex]);

  const handleBatchCreate = useCallback(async () => {
    setBatchCreateLoading(true);
    try {
      const step = store.currentStep;
      let cards = store.cards.length > 0 ? store.cards : store.confirmedCards;

      if (step === 'creative_setting' && selectedIndex >= 0 && selectedIndex < cards.length) {
        cards = [cards[selectedIndex]];
      }

      let entities = cards.map((c) => {
        const entity: Record<string, unknown> = {};
        entity.card_type = c.card_type || 'card';
        c.fields.forEach((f: CardField) => {
          const key = KEY_MAP[step]?.[f.key] || f.key;
          if (key === '__skip__') return;
          entity[key] = f.value;
        });
        return entity;
      });

      await batchCreate(step, bookStore.bookId, entities);

      store.updateContext(step, entities);
      store.addCompletedStep(step);

      await Promise.all([
        bookStore.loadCreativeSetting(),
        bookStore.loadWorld(),
        bookStore.loadCharacters(),
        bookStore.loadChapters(),
      ]);

      store.confirmCards([]);
      setSelectedIndex(-1);
      setRequirements('');
    } catch (err) {
      store.setStreamError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBatchCreateLoading(false);
    }
  }, [store, bookStore]);

  const handleRegenerate = useCallback(async () => {
    await handleGenerate();
  }, [handleGenerate]);

  const handleStepComplete = useCallback(async () => {
    if (isCreativeSetting && selectedIndex < 0 && store.cards.length > 0) {
      store.setStreamError('请先选择一张卡片再进入下一步');
      return;
    }
    await handleBatchCreate();
    store.nextStep();
    setSelectedIndex(-1);
  }, [handleBatchCreate, store, isCreativeSetting, selectedIndex]);

  const handleGoToStep = useCallback(async (targetStep: StepType) => {
    setSelectedIndex(-1);
    if (store.completedSteps.includes(targetStep)) {
      await Promise.all([
        bookStore.loadCreativeSetting(),
        bookStore.loadWorld(),
        bookStore.loadCharacters(),
        bookStore.loadChapters(),
      ]);
      const cs = bookStore.creativeSetting;
      if (targetStep === 'creative_setting' && cs) {
        const fields: CardField[] = [];
        if (cs.tone) fields.push({ key: '文风', value: cs.tone });
        if (cs.worldview) fields.push({ key: '世界观', value: cs.worldview });
        if (cs.writingTaboos) fields.push({ key: '写作禁忌', value: cs.writingTaboos });
        if (cs.customDimensions && Object.keys(cs.customDimensions).length > 0) {
          fields.push({ key: '自定义维度', value: JSON.stringify(cs.customDimensions) });
        }
        store.confirmCards([{ title: '已保存设定', fields, card_type: 'creative_setting' }]);
      }
    } else {
      store.confirmCards([]);
    }
    store.goToStep(targetStep);
  }, [store, bookStore]);

  // text parse handlers
  const handleParseText = () => {
    const cards = parseToCards(parseText);
    setParsedCards(cards);
    setParseSelected(new Set());
  };

  const toggleParseCard = (idx: number) => {
    setParseSelected((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  };

  const handleAddParsedCards = () => {
    const selectedCards = parsedCards.filter((_, i) => parseSelected.has(i));
    if (selectedCards.length > 0) {
      store.setCards([...store.cards, ...selectedCards]);
      setParsedCards([]);
      setParseSelected(new Set());
      setParseText('');
      setShowParse(false);
    }
  };

  if (!store.mode) return null;

  const handleExit = () => {
    store.reset();
    bookStore.setWizardMode(null);
  };

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border">
        <div className="flex items-center gap-3">
          <button
            onClick={handleExit}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            ← 退出
          </button>
          <span className="text-xs text-muted-foreground">流程模式</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowParse(!showParse)}
            className={cn(
              'px-3 py-1 text-xs rounded-full transition-colors border',
              showParse
                ? 'bg-foreground text-background border-foreground'
                : 'bg-secondary text-foreground/70 border-border hover:border-foreground/30',
            )}
          >
            文本解析
          </button>
          <div className="text-sm font-medium">{STEP_LABELS[step]}</div>
        </div>
      </div>

      {/* Step Nav */}
      <StepNav
        currentStep={step}
        currentStepIndex={store.currentStepIndex}
        onGoToStep={handleGoToStep}
        completedSteps={new Set(store.completedSteps)}
      />

      {/* Text parse overlay */}
      {showParse && (
        <div className="border-b border-border bg-secondary/30 px-6 py-4">
          <div className="max-w-2xl mx-auto space-y-3">
            <div className="text-xs text-muted-foreground">
              粘贴 AI 生成的文本，格式：<code className="text-[11px] bg-secondary rounded px-1">=== 标题 ===</code> + <code className="text-[11px] bg-secondary rounded px-1">字段: 值</code>
            </div>
            <textarea
              className="w-full h-28 text-xs bg-secondary rounded-lg p-3 text-foreground resize-y border border-border focus:outline-none focus:ring-1 focus:ring-ring"
              placeholder={`=== 青云宗 ===\n类型: 仙门\n描述: 位于青云山脉主峰...\n\n=== 万宝阁 ===\n类型: 商会\n描述: 横跨三界的商业联盟...`}
              value={parseText}
              onChange={(e) => setParseText(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={handleParseText}
                disabled={!parseText.trim()}
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
                      onClick={() => toggleParseCard(i)}
                      className="relative cursor-pointer"
                    >
                      <div className={parseSelected.has(i) ? 'ring-2 ring-foreground rounded-xl' : ''}>
                        <div className="relative select-none w-64 h-80 [perspective:1000px]">
                          <div className="absolute inset-0 rounded-xl border flex flex-col items-center justify-center bg-card border-border">
                            <div className="text-4xl mb-4 text-muted-foreground/60">◇</div>
                            <div className="text-sm font-medium text-muted-foreground">{card.title}</div>
                            <div className="text-xs text-muted-foreground/50 mt-2">#{i + 1}/{parsedCards.length}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={handleAddParsedCards}
                  disabled={parseSelected.size === 0}
                  className="px-4 py-1.5 text-xs rounded-lg bg-foreground text-background hover:opacity-80 disabled:opacity-40 transition-opacity"
                >
                  添加选中卡片 ({parseSelected.size})
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto">
        <div className="mx-auto p-6 space-y-6 max-w-6xl">
          {/* Outline settings */}
          {step === 'outline' && (
            <div className="flex items-center gap-4 justify-center">
              <label className="text-xs text-muted-foreground">
                卷数
                <input
                  type="number"
                  min={1}
                  max={20}
                  value={store.outlineSettings.volumeCount}
                  onChange={(e) => store.setOutlineSettings({ volumeCount: Number(e.target.value) })}
                  className="w-14 ml-1 px-1.5 py-0.5 text-xs bg-secondary rounded border border-border text-foreground"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                每卷章节
                <input
                  type="number"
                  min={1}
                  max={30}
                  value={store.outlineSettings.chaptersPerVolume}
                  onChange={(e) => store.setOutlineSettings({ chaptersPerVolume: Number(e.target.value) })}
                  className="w-14 ml-1 px-1.5 py-0.5 text-xs bg-secondary rounded border border-border text-foreground"
                />
              </label>
              <label className="text-xs text-muted-foreground">
                节点数
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={store.outlineSettings.nodesPerChapter}
                  onChange={(e) => store.setOutlineSettings({ nodesPerChapter: Number(e.target.value) })}
                  className="w-14 ml-1 px-1.5 py-0.5 text-xs bg-secondary rounded border border-border text-foreground"
                />
              </label>
              <select
                value={store.outlineSettings.mode}
                onChange={(e) => store.setOutlineSettings({ mode: e.target.value as 'all' | 'volume' | 'chapter' })}
                className="text-xs bg-secondary rounded border border-border text-foreground px-2 py-0.5"
              >
                <option value="all">一次性</option>
                <option value="volume">逐卷</option>
                <option value="chapter">逐章</option>
              </select>
            </div>
          )}

          {/* Cards */}
          {store.cards.length > 0 && (
            <CardGrid
              cards={store.cards}
              step={step}
              editable
              selectable={isCreativeSetting}
              selectedIndex={isCreativeSetting ? selectedIndex : -1}
              onSelect={isCreativeSetting ? (idx) => setSelectedIndex(idx === selectedIndex ? -1 : idx) : undefined}
              onEdit={handleApproveCard}
              onRemove={handleRemoveCard}
            />
          )}

          {/* Empty state */}
          {store.cards.length === 0 && !store.streamLoading && (
            <div className="text-center py-16 text-muted-foreground">
              <div className="text-4xl mb-4">◈</div>
              <div className="text-sm">点击"生成卡片"开始</div>
            </div>
          )}

          {/* Loading */}
          {store.streamLoading && (
            <div className="text-center py-16 text-muted-foreground">
              <div className="animate-pulse text-4xl mb-4">✦</div>
              <div className="text-sm">生成中...</div>
            </div>
          )}

          {/* Error */}
          {store.streamError && (
            <div className="text-center py-4 text-destructive text-sm">
              {store.streamError}
            </div>
          )}

          {/* Saved data for completed steps */}
          {store.completedSteps.includes(step) && store.confirmedCards.length > 0 && store.cards.length === 0 && (
            <div className="pt-4 border-t border-border/30">
              <div className="flex items-center gap-2 justify-center mb-3">
                <svg width="14" height="14" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.5" />
                  <path d="M3.5 6l1.5 1.5 3.5-3.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-xs text-muted-foreground">已保存数据 · 点击下方按钮可重新生成</span>
              </div>
              <CardGrid cards={store.confirmedCards} step={step} confirmed />
            </div>
          )}

          {/* Previous step cards */}
          {store.confirmedCards.length > 0 && store.cards.length === 0 && !store.completedSteps.includes(step) && (
            <div className="pt-4 border-t border-border/50">
              <div className="text-xs text-muted-foreground mb-3 text-center">上次生成的卡片</div>
              <CardGrid cards={store.confirmedCards} step={step} confirmed />
            </div>
          )}

          {/* Requirements input */}
          <div className="flex gap-2 max-w-xl mx-auto pt-4">
            <input
              type="text"
              value={requirements}
              onChange={(e) => setRequirements(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleGenerate(); }}
              placeholder="额外需求（可选，回车发送）"
              className="flex-1 text-xs bg-secondary rounded-lg px-3 py-2 text-foreground border border-border focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-3 pb-8">
            <button
              onClick={store.streamLoading ? () => abortRef.current?.abort() : handleRegenerate}
              className={cn(
                'px-6 py-2 text-sm rounded-full transition-opacity',
                store.streamLoading
                  ? 'bg-destructive/20 text-destructive'
                  : 'bg-foreground text-background hover:opacity-80',
              )}
            >
              {store.streamLoading ? '停止生成' : '重新生成'}
            </button>

            {(store.cards.length > 0 || store.confirmedCards.length > 0) && (
              <>
                {!isCreativeSetting && (
                  <button
                    onClick={handleBatchCreate}
                    disabled={batchCreateLoading}
                    className="px-6 py-2 text-sm rounded-full bg-primary/15 text-foreground hover:bg-primary/25 transition-colors disabled:opacity-40"
                  >
                    {batchCreateLoading ? '保存中...' : '保存全部'}
                  </button>
                )}
                <button
                  onClick={handleStepComplete}
                  disabled={batchCreateLoading}
                  className="px-6 py-2 text-sm rounded-full bg-secondary text-foreground hover:opacity-80 transition-opacity disabled:opacity-40"
                >
                  {isCreativeSetting ? '下一步' : '保存并下一步 →'}
                </button>
              </>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

const KEY_MAP: Record<string, Record<string, string>> = {
  creative_setting: {
    '文风': 'tone',
    '世界观': 'worldview',
    '写作禁忌': 'writing_taboos',
    '自定义维度': 'custom_dimensions',
    '方案名称': '__skip__',
  },
  locations: {
    '名称': 'name',
    '类型': 'type',
    '描述': 'description',
    '属性': 'attributes',
  },
  characters: {
    '名称': 'name',
    '描述': 'description',
    '角色类型': 'role_type',
    '别名': 'aliases',
    '自定义字段': 'custom_fields',
  },
  timeline_foreshadowing: {},
  plot_threads: {
    '名称': 'name',
    '描述': 'description',
    '类型': 'type',
    '关联角色': 'related_characters',
  },
  outline: {},
};
