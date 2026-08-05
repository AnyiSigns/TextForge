'use client';

import { useEffect, use, useState } from 'react';
import { useEntityStore } from '@/features/map/stores/entityStore';
import { useBookDetailStore } from './store';
import { useMapStore } from '@/features/map/stores/mapStore';
import { useTimelineStore } from '@/features/map/stores/timelineStore';
import { useInitializerStore } from '@/features/map/stores/initializerStore';
import { MapCanvas } from './MapCanvas';
import { TimelineBar } from '@/features/map/TimelineBar/TimelineBar';
import { FloatingEditor } from '@/features/map/FloatingEditor/FloatingEditor';
import { Initializer } from './Initializer';
import { StoryFlow } from './StoryFlow';
import { SimRoom } from './SimRoom';
import { SidePanel } from '@/features/map/SidePanel/SidePanel';
import { PanelLeftOpen, MessageCircle, Bot, PenLine, Sparkles } from 'lucide-react';

export default function MapPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const bookId = parseInt(id, 10);
  if (isNaN(bookId)) {
    return <div className="flex h-full items-center justify-center text-muted-foreground">无效的书籍 ID</div>;
  }
  const setBookId = useBookDetailStore((s) => s.setBookId);
  const loadBook = useBookDetailStore((s) => s.loadBook);
  const setAgentContext = useBookDetailStore((s) => s.setAgentContext);
  const agentOpen = useBookDetailStore((s) => s.agentOpen);
  const setAgentOpen = useBookDetailStore((s) => s.setAgentOpen);
  const openInitializer = useInitializerStore((s) => s.open);
  const characters = useEntityStore((s) => s.characters);
  const selectedCharacterId = useMapStore((s) => s.selectedCharacterId);
  const selectedEventId = useTimelineStore((s) => s.selectedEventId);
  const sceneEvents = useEntityStore((s) => s.sceneEvents);
  const locations = useEntityStore((s) => s.locations);

  const [panelOpen, setPanelOpen] = useState(false);
  const [simRoomOpen, setSimRoomOpen] = useState(false);
  const loadFromApi = useEntityStore((s) => s.loadFromApi);

  useEffect(() => {
    setBookId(bookId);
  }, [bookId, setBookId]);

  useEffect(() => {
    void loadBook(bookId);
  }, [bookId, loadBook]);

  useEffect(() => {
    void loadFromApi(bookId);
  }, [bookId, loadFromApi]);

  const handleAgentToggle = () => {
    const opening = !agentOpen;
    setAgentOpen(opening);
    if (opening) {
      // 收集当前上下文注入 Agent
      const parts: string[] = [];
      const selectedChar = selectedCharacterId
        ? characters.find((c) => c.id === selectedCharacterId)
        : null;
      const selectedEvent = selectedEventId
        ? sceneEvents.find((e) => e.id === selectedEventId)
        : null;

      if (selectedChar) parts.push(`选中角色：${selectedChar.name}`);
      if (selectedEvent) {
        parts.push(`选中事件：${selectedEvent.title}`);
        const loc = selectedEvent.locationId
          ? locations.find((l) => l.id === selectedEvent.locationId)
          : null;
        if (loc) parts.push(`地点：${loc.name}`);
      }
      if (parts.length > 0) {
        setAgentContext(`当前上下文：${parts.join('、')}。`);
      }
    }
  };

  return (
    <div className="flex h-full w-full bg-background">
      {panelOpen && (
        <div className="w-60 flex-shrink-0">
          <SidePanel onClose={() => setPanelOpen(false)} />
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 relative overflow-hidden">
          {!panelOpen && (
            <div className="absolute top-4 left-4 z-30 flex flex-col gap-1.5">
              <button
                onClick={() => setPanelOpen(true)}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-card/90 backdrop-blur-sm border border-border/50 shadow-sm cursor-pointer text-muted-foreground/60 hover:text-foreground hover:bg-card transition-colors"
                title="打开面板"
              >
                <PanelLeftOpen size={14} strokeWidth={1.5} />
              </button>
              <button
                onClick={() => setSimRoomOpen(true)}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-card/90 backdrop-blur-sm border border-border/50 shadow-sm cursor-pointer text-muted-foreground/60 hover:text-foreground hover:bg-card transition-colors"
                title="Sim Room"
              >
                <MessageCircle size={14} strokeWidth={1.5} />
              </button>
              <button
                onClick={handleAgentToggle}
                className={`w-8 h-8 flex items-center justify-center rounded-xl border shadow-sm cursor-pointer transition-colors ${
                  agentOpen
                    ? 'bg-foreground/10 border-foreground/30 text-foreground/70'
                    : 'bg-card/90 border-border/50 text-muted-foreground/60 hover:text-foreground hover:bg-card'
                }`}
                title="AI 助手"
              >
                <Bot size={14} strokeWidth={1.5} />
              </button>
              <a
                href={`/manuscript/book/${bookId}`}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-card/90 backdrop-blur-sm border border-border/50 shadow-sm text-muted-foreground/60 hover:text-foreground hover:bg-card transition-colors no-underline"
                title="手稿"
              >
                <PenLine size={14} strokeWidth={1.5} />
              </a>
              <button
                onClick={() => openInitializer()}
                className="w-8 h-8 flex items-center justify-center rounded-xl bg-card/90 backdrop-blur-sm border border-border/50 shadow-sm cursor-pointer text-muted-foreground/60 hover:text-foreground hover:bg-card transition-colors"
                title="初始化器"
              >
                <Sparkles size={14} strokeWidth={1.5} />
              </button>
            </div>
          )}
          <MapCanvas />
        </div>

        <TimelineBar />
      </div>

      <FloatingEditor />
      <Initializer />
      <StoryFlow />
      {simRoomOpen && (
        <SimRoom onClose={() => setSimRoomOpen(false)} />
      )}
    </div>
  );
}
