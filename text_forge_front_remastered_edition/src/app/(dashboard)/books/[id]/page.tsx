'use client';

import { useEffect, use } from 'react';
import { useBookDetailStore } from './store';
import { useWizardStore, hasProgress, loadProgressForBook } from './wizard/store';
import { TabSidebar } from './TabSidebar';
import { OverviewTab } from './tabs/OverviewTab';
import { OutlineTab } from './tabs/OutlineTab';
import { SettingsTab } from './tabs/SettingsTab';
import { CardDrawRoom } from './tabs/CardDrawRoom';
import { CharacterList } from './Sidebar/CharacterList';
import { WorldPanel } from './Sidebar/WorldPanel';
import { WizardModal } from './wizard/WizardModal';

function WizardEntry({ bookId }: { bookId: number }) {
  const bookStore = useBookDetailStore();
  const wizardStore = useWizardStore();

  const handleStartFlow = () => {
    bookStore.setWizardMode('flow');
    wizardStore.setBookId(bookId);
    wizardStore.setMode('flow');
  };

  const handleStartCustom = () => {
    bookStore.setWizardMode('custom');
    wizardStore.setMode('custom');
  };

  return (
    <div className="flex flex-col items-center justify-center h-full gap-6">
      <div className="text-center space-y-2">
        <div className="text-lg font-medium text-foreground">开始创作</div>
        <div className="text-sm text-muted-foreground">选择一种模式来构建你的故事世界</div>
      </div>
      <div className="flex gap-4">
        <button
          onClick={handleStartFlow}
          className="group relative px-8 py-12 rounded-2xl border border-border bg-card hover:bg-accent/5 transition-all duration-200 flex flex-col items-center gap-3 min-w-[200px]"
        >
          <div className="text-3xl opacity-80">✦</div>
          <div className="text-sm font-medium">流程模式</div>
          <div className="text-[11px] text-muted-foreground text-center leading-relaxed">
            按步骤引导创建<br />世界观 → 角色 → 大纲
          </div>
        </button>
        <button
          onClick={handleStartCustom}
          className="group relative px-8 py-12 rounded-2xl border border-border bg-card hover:bg-accent/5 transition-all duration-200 flex flex-col items-center gap-3 min-w-[200px]"
        >
          <div className="text-3xl opacity-80">◈</div>
          <div className="text-sm font-medium">自定义模式</div>
          <div className="text-[11px] text-muted-foreground text-center leading-relaxed">
            自由操作<br />直接编辑所有设定
          </div>
        </button>
      </div>
    </div>
  );
}

export default function BookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const bookId = parseInt(id, 10);
  const {
    book, loading, error, activeTab, cardDrawOpen, creativePhase, cardDrawPreset, wizardMode,
    characters, creativeSetting, chapters, locations,
    loadBook, loadChapters, loadCharacters, loadWorld, loadCreativeSetting, loadWritingStats,
    setActiveTab, closeCardDraw, autoDetectPhase, setCreativePhase, setWizardMode,
    setAgentThreadId, setAgentStreaming,
  } = useBookDetailStore();
  const wizardStore = useWizardStore();

  useEffect(() => {
    try {
      const autoStartFlag = sessionStorage.getItem('wizard_auto_start') === String(bookId);
      if (autoStartFlag) sessionStorage.removeItem('wizard_auto_start');
      const hasSaved = hasProgress(bookId);
      if (autoStartFlag || hasSaved) {
        wizardStore.setBookId(bookId);
        wizardStore.setMode('flow');
        setWizardMode('flow');
      }
    } catch {}
  }, [bookId, wizardStore, setWizardMode]);

  useEffect(() => {
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
    if (!book || loading) return;
    const timer = setTimeout(() => { autoDetectPhase(); }, 400);
    return () => clearTimeout(timer);
  }, [book, loading, autoDetectPhase]);

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

  if (wizardMode === 'flow') {
    return <WizardModal />;
  }

  if (loading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">加载中...</div>;
  }
  if (error || !book) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{error || '书籍不存在'}</div>;
  }

  const hasCreativeSetting = creativeSetting && (!!creativeSetting.worldview || !!creativeSetting.tone);
  const isEmpty = !hasCreativeSetting && characters.length === 0 && chapters.length === 0 && locations.length === 0 && !cardDrawOpen && wizardMode !== 'custom';

  if (isEmpty) {
    return (
      <div className="flex items-center justify-center h-full">
        <WizardEntry bookId={bookId} />
      </div>
    );
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
