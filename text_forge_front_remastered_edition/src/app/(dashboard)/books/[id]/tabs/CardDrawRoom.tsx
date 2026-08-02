'use client';

import { useState, useMemo } from 'react';
import { X, ArrowRight, Wand2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useBookDetailStore } from '../store';

interface CardDrawRoomProps {
  onClose: () => void;
}

export function CardDrawRoom({ onClose }: CardDrawRoomProps) {
  const characters = useBookDetailStore((s) => s.characters);
  const locations = useBookDetailStore((s) => s.locations);
  const chapters = useBookDetailStore((s) => s.chapters);
  const books = useBookDetailStore((s) => s.book);

  const allChapters = useMemo(
    () => chapters.flatMap((v) => v.chapters.map((ch) => ({ ...ch, volumeTitle: v.title }))),
    [chapters],
  );

  const [selectedCharacters, setSelectedCharacters] = useState<number[]>([]);
  const [selectedLocations, setSelectedLocations] = useState<number[]>([]);
  const [selectedOutlineNode, setSelectedOutlineNode] = useState('');
  const [storyDirection, setStoryDirection] = useState('');
  const [extraRequirements, setExtraRequirements] = useState('');

  const toggleCharacter = (id: number) => {
    setSelectedCharacters((prev) =>
      prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id],
    );
  };

  const toggleLocation = (id: number) => {
    setSelectedLocations((prev) =>
      prev.includes(id) ? prev.filter((l) => l !== id) : [...prev, id],
    );
  };

  const buildCardJson = () => ({
    bookId: books?.id,
    bookTitle: books?.title,
    characters: characters.filter((c) => selectedCharacters.includes(c.id)).map((c) => ({
      id: c.id, name: c.name, roleType: c.roleType, description: c.description?.slice(0, 200),
    })),
    locations: locations.filter((l) => selectedLocations.includes(l.id)).map((l) => ({
      id: l.id, name: l.name, type: l.type,
    })),
    outlineNode: selectedOutlineNode,
    storyDirection,
    extraRequirements,
  });

  const handleStart = () => {
    const params = buildCardJson();
    // Emit custom event for AgentPanel to pick up
    window.dispatchEvent(new CustomEvent('textforge:card-draw-start', { detail: params }));
    onClose();
  };

  return (
    <div className="flex flex-col h-full bg-background">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Wand2 size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold">抽卡创作</h2>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer">
          <X size={16} />
        </button>
      </div>

      <div className="text-[11px] text-muted-foreground mb-4">
        选择创作要素，Agent 将基于你的选择模拟剧情展开
      </div>

      <div className="space-y-4 overflow-y-auto flex-1 pr-1">
        <div className="p-3 rounded-lg border border-border bg-card">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">角色选择</div>
          <div className="flex flex-wrap gap-1.5">
            {characters.map((ch) => (
              <button
                key={ch.id}
                onClick={() => toggleCharacter(ch.id)}
                className={cn(
                  'text-[12px] px-2 py-1 rounded-full border bg-transparent cursor-pointer transition-colors',
                  selectedCharacters.includes(ch.id)
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border hover:border-foreground/30',
                )}
              >
                {ch.name}
              </button>
            ))}
            {characters.length === 0 && <span className="text-xs text-muted-foreground">暂无可选角色</span>}
          </div>
        </div>

        <div className="p-3 rounded-lg border border-border bg-card">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">地点选择</div>
          <div className="flex flex-wrap gap-1.5">
            {locations.map((l) => (
              <button
                key={l.id}
                onClick={() => toggleLocation(l.id)}
                className={cn(
                  'text-[12px] px-2 py-1 rounded-full border bg-transparent cursor-pointer transition-colors',
                  selectedLocations.includes(l.id)
                    ? 'border-foreground bg-foreground text-background'
                    : 'border-border hover:border-foreground/30',
                )}
              >
                {l.name}
              </button>
            ))}
            {locations.length === 0 && <span className="text-xs text-muted-foreground">暂无可选地点</span>}
          </div>
        </div>

        <div className="p-3 rounded-lg border border-border bg-card">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">关联大纲节点</div>
          <select
            value={selectedOutlineNode}
            onChange={(e) => setSelectedOutlineNode(e.target.value)}
            className="w-full h-8 px-2 rounded-md text-xs bg-background border border-border focus:outline-none"
          >
            <option value="">不关联</option>
            {allChapters.map((ch) => (
              <option key={ch.id} value={ch.title}>{ch.volumeTitle} › {ch.title}</option>
            ))}
          </select>
        </div>

        <div className="p-3 rounded-lg border border-border bg-card">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">故事方向</div>
          <input
            type="text"
            value={storyDirection}
            onChange={(e) => setStoryDirection(e.target.value)}
            placeholder="例：复仇、成长、探索、悬疑..."
            className="w-full h-8 px-2 rounded-md text-xs bg-background border border-border focus:outline-none"
          />
        </div>

        <div className="p-3 rounded-lg border border-border bg-card">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">额外要求</div>
          <textarea
            value={extraRequirements}
            onChange={(e) => setExtraRequirements(e.target.value)}
            placeholder="特殊风格、节奏偏好、禁止事项..."
            className="w-full h-16 px-2 py-1 rounded-md text-xs bg-background border border-border focus:outline-none resize-none"
          />
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-border">
        <button
          onClick={handleStart}
          disabled={selectedCharacters.length === 0}
          className="w-full h-9 rounded-md bg-foreground text-background text-sm font-medium border-none cursor-pointer hover:opacity-90 disabled:opacity-30 flex items-center justify-center gap-2"
        >
          <Wand2 size={14} /> 开始抽卡 <ArrowRight size={14} />
        </button>
      </div>
    </div>
  );
}
