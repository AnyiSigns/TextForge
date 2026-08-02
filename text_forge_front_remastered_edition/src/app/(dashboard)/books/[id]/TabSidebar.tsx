'use client';

import { LayoutDashboard, FileText, Users, Globe, SlidersHorizontal } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useBookDetailStore } from './store';
import type { TabId, CreativePhase } from './store';

const tabs: { id: TabId; icon: typeof LayoutDashboard; label: string }[] = [
  { id: 'overview', icon: LayoutDashboard, label: '概览' },
  { id: 'outline', icon: FileText, label: '大纲' },
  { id: 'characters', icon: Users, label: '角色' },
  { id: 'world', icon: Globe, label: '世界' },
  { id: 'settings', icon: SlidersHorizontal, label: '设定' },
];

const phaseLabels: Record<CreativePhase, string> = {
  overview: '概览',
  worldbuilding: '世界观构建',
  outlining: '大纲规划',
  drafting: '撰写中',
  revising: '修订中',
};

export function TabSidebar() {
  const activeTab = useBookDetailStore((s) => s.activeTab);
  const setActiveTab = useBookDetailStore((s) => s.setActiveTab);
  const creativePhase = useBookDetailStore((s) => s.creativePhase);
  const setCreativePhase = useBookDetailStore((s) => s.setCreativePhase);

  return (
    <div className="ide-tabsbar">
      {tabs.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => setActiveTab(id)}
          className={cn('ide-tabsbar-btn', activeTab === id && 'is-active')}
          title={label}
        >
          <Icon size={16} strokeWidth={1.8} />
          <span>{label}</span>
        </button>
      ))}
      <div style={{ flex: 1 }} />
      <div className="ide-tabsbar-btn" style={{ aspectRatio: 'auto', padding: '8px 4px 6px' }} title={phaseLabels[creativePhase]}>
        <select
          value={creativePhase}
          onChange={(e) => setCreativePhase(e.target.value as CreativePhase)}
          className="text-[10px] bg-transparent border border-border rounded px-1 py-0.5 text-muted-foreground cursor-pointer w-full"
        >
          {(Object.keys(phaseLabels) as CreativePhase[]).map((phase) => (
            <option key={phase} value={phase}>{phaseLabels[phase]}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
