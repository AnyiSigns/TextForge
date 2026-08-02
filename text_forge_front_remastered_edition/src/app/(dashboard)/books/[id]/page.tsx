'use client';

import { useEffect, use } from 'react';
import { useBookDetailStore } from './store';
import { cn } from '@/shared/lib/cn';
import { ActivityBar } from './ActivityBar';
import { Sidebar } from './Sidebar';
import { AgentPanel } from './AgentPanel/AgentPanel';
import { OverviewTab } from './tabs/OverviewTab';
import { OutlineTab } from './tabs/OutlineTab';
import { SettingsTab } from './tabs/SettingsTab';
import { CardDrawRoom } from './tabs/CardDrawRoom';

export default function BookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const bookId = parseInt(id, 10);
  const {
    book, loading, error, activePanel, activeTab, sidebarCollapsed, agentOpen, cardDrawOpen,
    loadBook, loadChapters, loadCharacters, loadWorld, loadCreativeSetting, loadWritingStats,
    setActiveTab, closeCardDraw,
  } = useBookDetailStore();

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

  const tabs = [
    { id: 'overview' as const, label: '概览' },
    { id: 'outline' as const, label: '大纲' },
    { id: 'settings' as const, label: '设定' },
  ];

  const sidebarVisible = !sidebarCollapsed;
  const gridClass = cn(
    'ide-grid',
    'ide-grid--tabbar',
    sidebarVisible && 'ide-grid--sidebar',
    agentOpen && 'ide-grid--agent',
  );

  if (loading) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">加载中...</div>;
  }
  if (error || !book) {
    return <div className="flex items-center justify-center h-full text-muted-foreground text-sm">{error || '书籍不存在'}</div>;
  }

  return (
    <div className={gridClass}>
      <div className="ide-tabbar">
        {tabs.map(({ id, label }) => (
          <button key={id} onClick={() => setActiveTab(id)}
            className={cn('ide-tab border-none bg-transparent cursor-pointer', activeTab === id && 'is-active')}>
            {label}
          </button>
        ))}
      </div>

      <ActivityBar />

      {sidebarVisible && <Sidebar />}

      <main className="ide-editor">
        <div className="ide-editor-body">
          {cardDrawOpen ? (
            <CardDrawRoom onClose={closeCardDraw} />
          ) : (
            <>
              {activeTab === 'overview' && <OverviewTab />}
              {activeTab === 'outline' && <OutlineTab />}
              {activeTab === 'settings' && <SettingsTab />}
            </>
          )}
        </div>
      </main>

      {agentOpen && <AgentPanel />}
    </div>
  );
}
