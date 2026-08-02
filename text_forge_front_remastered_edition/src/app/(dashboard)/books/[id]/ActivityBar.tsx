'use client';

import { FileText, Users, Globe } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useBookDetailStore } from './store';
import type { PanelId } from './types';

const panels: { id: PanelId; icon: typeof FileText; label: string }[] = [
  { id: 'outline', icon: FileText, label: '大纲' },
  { id: 'characters', icon: Users, label: '角色' },
  { id: 'world', icon: Globe, label: '世界' },
];

export function ActivityBar() {
  const activePanel = useBookDetailStore((s) => s.activePanel);
  const setActivePanel = useBookDetailStore((s) => s.setActivePanel);

  return (
    <div className="ide-activity">
      {panels.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => setActivePanel(id)}
          className={cn('ide-activity-btn', activePanel === id && 'is-active')}
          title={label}
        >
          <Icon size={18} strokeWidth={1.5} />
        </button>
      ))}
    </div>
  );
}
