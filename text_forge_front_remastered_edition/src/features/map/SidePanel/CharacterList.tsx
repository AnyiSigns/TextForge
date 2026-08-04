'use client';

import { useMemo } from 'react';
import { useEntityStore } from '@/features/map/stores/entityStore';
import { useMapStore } from '@/features/map/stores/mapStore';
import { useEditorStore } from '@/features/map/stores/editorStore';
import type { MockLocation } from '@/mocks/data';

function findVisibleRoot(locId: number, locations: MockLocation[]): MockLocation | null {
  let current = locations.find((l) => l.id === locId) ?? null;
  // 上溯到根级的直接子级（适合作为地图入口的层级）
  while (current?.parentId) {
    const parent = locations.find((l) => l.id === current!.parentId);
    if (!parent) break;
    current = parent;
  }
  return current;
}

export function CharacterList() {
  const characters = useEntityStore((s) => s.characters);
  const selectedId = useMapStore((s) => s.selectedCharacterId);
  const selectCharacter = useMapStore((s) => s.selectCharacter);
  const navigateTo = useMapStore((s) => s.navigateTo);
  const locations = useEntityStore((s) => s.locations);
  const openEditor = useEditorStore((s) => s.open);

  const byType = useMemo(() => {
    const groups: Record<string, typeof characters> = {};
    for (const ch of characters) {
      const type = ch.roleType || '其他';
      if (!groups[type]) groups[type] = [];
      groups[type].push(ch);
    }
    return groups;
  }, [characters]);

  return (
    <div className="space-y-3">
      {Object.entries(byType).map(([type, chars]) => (
        <div key={type}>
          <div className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider px-1 mb-1.5">
            {type}
          </div>
          <div className="space-y-0.5">
            {chars.map((ch) => {
              const initials = ch.name.slice(0, 2);
              const isSelected = selectedId === ch.id;
              return (
              <div
                key={ch.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors cursor-pointer group ${
                  isSelected
                    ? 'bg-foreground/[0.06] text-foreground/90'
                    : 'hover:bg-foreground/[0.03] text-foreground/60'
                }`}
                onClick={() => {
                  selectCharacter(isSelected ? null : ch.id);
                  const locId = ch.baseLocationId ?? ch.spawnLocationId;
                  if (locId) {
                    const target = findVisibleRoot(locId, locations);
                    if (target) navigateTo(target.id);
                  }
                }}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold flex-shrink-0 ${
                    isSelected
                      ? 'bg-foreground/15 text-foreground/80'
                      : 'bg-muted/60 text-muted-foreground/60'
                  }`}>
                    {initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-medium truncate">{ch.name}</div>
                    <div className="text-[10px] text-muted-foreground/50 truncate">{ch.status}</div>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      openEditor('character', ch.id);
                    }}
                    className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground/30 hover:text-foreground/60 transition-colors opacity-0 group-hover:opacity-100 bg-transparent border-none cursor-pointer"
                    style={{ opacity: 0 }}
                    title="编辑"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
