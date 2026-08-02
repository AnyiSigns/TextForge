'use client';

import { useBookDetailStore } from '../store';
import { Lock, MapPin, Clock, Eye, GitBranch, Plus } from 'lucide-react';
import type { WorldSubTab } from '../types';
import type { Location, TimelineEvent, Foreshadowing, PlotThread } from '@/shared/api/types';

const SUB_TABS: { id: WorldSubTab; label: string; icon: typeof MapPin }[] = [
  { id: 'locations' as const, label: '地点', icon: MapPin },
  { id: 'events' as const, label: '事件', icon: Clock },
  { id: 'foreshadowings' as const, label: '伏笔', icon: Eye },
  { id: 'plot-threads' as const, label: '线索', icon: GitBranch },
];

type WorldItem = Location | TimelineEvent | Foreshadowing | PlotThread;

function getItemLabel(item: WorldItem): string {
  if ('name' in item) return item.name;
  if ('description' in item) return item.description.slice(0, 20);
  return '未命名';
}

export function WorldPanel() {
  const worldSubTab = useBookDetailStore((s) => s.worldSubTab);
  const setWorldSubTab = useBookDetailStore((s) => s.setWorldSubTab);
  const locations = useBookDetailStore((s) => s.locations);
  const timelineEvents = useBookDetailStore((s) => s.timelineEvents);
  const foreshadowings = useBookDetailStore((s) => s.foreshadowings);
  const plotThreads = useBookDetailStore((s) => s.plotThreads);

  const dataMap: Record<WorldSubTab, WorldItem[]> = {
    locations,
    events: timelineEvents,
    foreshadowings,
    'plot-threads': plotThreads,
  };

  const currentData = dataMap[worldSubTab];

  return (
    <>
      <div className="ide-sidebar-header">
        {SUB_TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setWorldSubTab(id)}
            className={`text-[11px] px-1.5 py-0.5 rounded cursor-pointer bg-transparent border-none transition-colors ${
              worldSubTab === id ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
        <button className="text-muted-foreground text-xs hover:text-foreground cursor-pointer bg-transparent border-none ml-auto" title="新建">
          <Plus size={14} />
        </button>
      </div>
      <div className="ide-sidebar-body p-1 space-y-0.5">
        {currentData.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-[var(--sidebar-hover)] cursor-pointer text-[13px]"
            role="button"
            tabIndex={0}
          >
            <span className="flex-1 truncate">{getItemLabel(item)}</span>
            {item.locked && <Lock size={10} className="text-muted-foreground shrink-0" />}
          </div>
        ))}
        {currentData.length === 0 && (
          <div className="text-xs text-muted-foreground p-3 text-center">暂无数据</div>
        )}
      </div>
      <div className="ide-sidebar-footer space-y-0.5">
        <div className="ide-sidebar-stat">
          <span>锁定项</span>
          <span>{currentData.filter((item) => item.locked).length}</span>
        </div>
      </div>
    </>
  );
}
