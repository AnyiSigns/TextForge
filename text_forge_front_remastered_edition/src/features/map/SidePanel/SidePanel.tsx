'use client';

import { useState } from 'react';
import { Users, MapPin, ListTree, Lightbulb, PanelLeftClose } from 'lucide-react';
import { CharacterList } from './CharacterList';
import { LocationTree } from './LocationTree';
import { OutlineTree } from './OutlineTree';
import { EntityPanel } from './EntityPanel';

type Tab = 'characters' | 'locations' | 'outline' | 'plot';

interface SidePanelProps {
  onClose: () => void;
}

export function SidePanel({ onClose }: SidePanelProps) {
  const [activeTab, setActiveTab] = useState<Tab>('locations');

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'characters', label: '角色', icon: <Users size={15} strokeWidth={1.5} /> },
    { id: 'locations', label: '地点', icon: <MapPin size={15} strokeWidth={1.5} /> },
    { id: 'outline', label: '大纲', icon: <ListTree size={15} strokeWidth={1.5} /> },
    { id: 'plot', label: '伏笔', icon: <Lightbulb size={15} strokeWidth={1.5} /> },
  ];

  return (
    <div className="h-full flex flex-col bg-card/95 backdrop-blur-md border-r border-border/60 shadow-xl">
      <div className="flex border-b border-border/30">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex-1 flex items-center justify-center gap-1 py-2.5 text-[11px] font-medium bg-transparent border-none cursor-pointer transition-colors ${
              activeTab === tab.id
                ? 'text-foreground border-b-2 border-foreground/30'
                : 'text-muted-foreground/60 hover:text-muted-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {activeTab === 'characters' && <CharacterList />}
        {activeTab === 'locations' && <LocationTree />}
        {activeTab === 'outline' && <OutlineTree />}
        {activeTab === 'plot' && <EntityPanel />}
      </div>

      <div className="border-t border-border/30 p-2">
        <button
          onClick={onClose}
          className="w-full flex items-center justify-center gap-1.5 h-8 rounded-md text-xs text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5 bg-transparent border-none cursor-pointer transition-colors"
        >
          <PanelLeftClose size={13} strokeWidth={1.5} />
          收起面板
        </button>
      </div>
    </div>
  );
}
