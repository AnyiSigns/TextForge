'use client';

import { useEffect, use, useRef } from 'react';
import { useBookDetailStore, type CreativePhase } from './store';
import { TabSidebar } from './TabSidebar';
import { OverviewTab } from './tabs/OverviewTab';
import { OutlineTab } from './tabs/OutlineTab';
import { SettingsTab } from './tabs/SettingsTab';
import { CardDrawRoom } from './tabs/CardDrawRoom';
import { CharacterList } from './Sidebar/CharacterList';
import { WorldPanel } from './Sidebar/WorldPanel';
import * as agentApi from '@/shared/api/agent';

export default function BookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const bookId = parseInt(id, 10);
  const analyzedRef = useRef(false);
  const detectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const {
    book, loading, error, activeTab, cardDrawOpen, creativePhase, cardDrawPreset,
    loadBook, loadChapters, loadCharacters, loadWorld, loadCreativeSetting, loadWritingStats,
    setActiveTab, closeCardDraw, autoDetectPhase, setCreativePhase,
    agentThreadId, setAgentThreadId, agentStreaming, setAgentStreaming, addAgentMessage, updateAgentStreamToken,
  } = useBookDetailStore();

  useEffect(() => {
    analyzedRef.current = false;
    setAgentThreadId(null);
    setAgentStreaming(false);
    setCreativePhase('overview');
  }, [bookId, setAgentThreadId, setAgentStreaming, setCreativePhase]);

  useEffect(() => {
    void loadBook(bookId);
  }, [bookId, loadBook]);

  useEffect(() => {
    if (book) {
      void loadChapters();
      void loadCharacters();
      void loadWorld();
      void loadCreativeSetting();
      void loadWritingStats();
    }
  }, [book, loadChapters, loadCharacters, loadWorld, loadCreativeSetting, loadWritingStats]);

  useEffect(() => {
    if (detectTimerRef.current) clearTimeout(detectTimerRef.current);
    if (!book || loading) return;
    detectTimerRef.current = setTimeout(() => {
      autoDetectPhase();
    }, 400);
    return () => {
      if (detectTimerRef.current) clearTimeout(detectTimerRef.current);
    };
  }, [book, loading, autoDetectPhase]);

  useEffect(() => {
    if (!book || loading || analyzedRef.current || agentThreadId) return;
    analyzedRef.current = true;
    (async () => {
      try {
        const session = await agentApi.startAgentSession(bookId);
        setAgentThreadId(session.thread_id);
        setAgentStreaming(true);
        const prompt = '请分析当前书籍的创作状态，判断当前处于哪个创作阶段（initializing/worldbuilding/outlining/drafting/revising），并提议需要创建的卡片类型（world_setup/plot_direction/character_intro/location_card/foreshadow_card/char_dialogue）。输出JSON格式：{"phase":"...","proposals":[{"type":"...","reason":"..."}]}';
        addAgentMessage({ role: 'user', content: prompt });
        addAgentMessage({ role: 'assistant', content: '', type: 'streaming' });
        await agentApi.streamAgent(
          session.thread_id,
          prompt,
          (event) => {
            if (event.type === 'propose_cards') {
              setCreativePhase(event.card_types?.includes('world_setup') || event.card_types?.includes('character_intro') ? 'worldbuilding' : 'outlining');
              addAgentMessage({ role: 'assistant', content: '', type: 'propose-cards', token: JSON.stringify({ card_types: event.card_types, reason: event.reason, cards: event.cards }) });
            } else if (event.type === 'token') {
              updateAgentStreamToken(event.token || '');
            }
          },
          () => setAgentStreaming(false),
          (err) => { addAgentMessage({ role: 'assistant', content: err, type: 'error' }); setAgentStreaming(false); },
        );
      } catch {
        analyzedRef.current = false;
      }
    })();
  }, [book, loading, agentThreadId, bookId, setAgentThreadId, setAgentStreaming, addAgentMessage, updateAgentStreamToken, autoDetectPhase, setCreativePhase]);

  useEffect(() => {
    if (!book) return;
    switch (creativePhase) {
      case 'worldbuilding':
        setActiveTab('settings');
        break;
      case 'outlining':
        setActiveTab('outline');
        break;
      case 'drafting':
        setActiveTab('outline');
        break;
      case 'revising':
        setActiveTab('overview');
        break;
    }
  }, [creativePhase, book, setActiveTab]);

  if (loading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">加载中...</div>;
  }
  if (error || !book) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{error || '书籍不存在'}</div>;
  }

  return (
    <div className="ide-grid">
      <TabSidebar />
      <main className="ide-editor">
        <div className="ide-editor-body">
          {cardDrawOpen ? (
            <CardDrawRoom onClose={closeCardDraw} preset={cardDrawPreset} />
          ) : (
            <>
              {activeTab === 'overview' && <OverviewTab />}
              {activeTab === 'outline' && <OutlineTab />}
              {activeTab === 'characters' && <CharacterList />}
              {activeTab === 'world' && <WorldPanel />}
              {activeTab === 'settings' && <SettingsTab />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
