'use client';

import { useState, useMemo } from 'react';
import { Search, ChevronRight, Users } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useMapStore } from '@/features/map/stores/mapStore';
import { useEditorStore } from '@/features/map/stores/editorStore';
import { useEntityStore } from '@/features/map/stores/entityStore';
import type { MockCharacter } from '@/mocks/data';

export function CharacterSidebar() {
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState('');

  const focusedLocationId = useMapStore((s) => s.focusedLocationId);
  const selectCharacter = useMapStore((s) => s.selectCharacter);
  const selectedCharacterId = useMapStore((s) => s.selectedCharacterId);
  const navigateTo = useMapStore((s) => s.navigateTo);
  const openEditor = useEditorStore((s) => s.open);

  const locations = useEntityStore((s) => s.locations);
  const allCharacters = useEntityStore((s) => s.characters);

  const descendantIds = useMemo(() => {
    if (focusedLocationId === null) return new Set<number>();
    const ids = new Set<number>([focusedLocationId]);
    const queue = [focusedLocationId];
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const loc of locations) {
        if (loc.parentId === current && !ids.has(loc.id)) {
          ids.add(loc.id);
          queue.push(loc.id);
        }
      }
    }
    return ids;
  }, [focusedLocationId, locations]);

  const relevantCharacters = useMemo(() => {
    return allCharacters.filter((ch) => {
      const locId = ch.baseLocationId ?? ch.spawnLocationId;
      if (!locId) return false;

      let current = locations.find((l) => l.id === locId) ?? null;
      while (current) {
        if (descendantIds.has(current.id)) return true;
        if (!current.parentId) return false;
        const pid = current.parentId;
        current = locations.find((l) => l.id === pid) ?? null;
      }
      return false;
    });
  }, [allCharacters, locations, descendantIds]);

  const filtered = useMemo(() => {
    if (!search) return relevantCharacters;
    const q = search.toLowerCase();
    return relevantCharacters.filter(
      (ch) =>
        ch.name.toLowerCase().includes(q) ||
        ch.roleType.toLowerCase().includes(q) ||
        ch.status.toLowerCase().includes(q),
    );
  }, [relevantCharacters, search]);

  const handleCharacterClick = (ch: MockCharacter) => {
    const locId = ch.baseLocationId ?? ch.spawnLocationId;
    if (locId) {
      let current = locations.find((l) => l.id === locId) ?? null;
      while (current) {
        if (descendantIds.has(current.id)) {
          break;
        }
        if (!current.parentId) {
          navigateTo(locId);
          return;
        }
        const pid = current.parentId;
        current = locations.find((l) => l.id === pid) ?? null;
      }
    }
    selectCharacter(selectedCharacterId === ch.id ? null : ch.id);
  };

  return (
    <div className="absolute right-0 top-12 z-30 flex">
      {!expanded && (
        <button
          onClick={() => setExpanded(true)}
          className="w-9 h-9 flex items-center justify-center bg-card/90 backdrop-blur-sm border border-border/50 rounded-l-xl shadow-sm cursor-pointer text-muted-foreground/60 hover:text-foreground transition-colors"
          title="角色侧栏"
        >
          <Users size={14} strokeWidth={1.5} />
        </button>
      )}

      {expanded && (
        <div className="w-[260px] bg-card/95 backdrop-blur-md border-l border-y border-border/50 rounded-l-xl shadow-lg overflow-hidden flex flex-col max-h-[70vh]">
          <div className="flex items-center justify-between px-3 h-10 border-b border-border/30">
            <span className="text-[11px] font-medium text-foreground/70">
              角色列表
              {focusedLocationId !== null && ` (${relevantCharacters.length})`}
            </span>
            <button
              onClick={() => setExpanded(false)}
              className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-foreground/60 bg-transparent border-none cursor-pointer"
            >
              <ChevronRight size={12} />
            </button>
          </div>

          <div className="px-3 py-2 border-b border-border/20">
            <div className="relative">
              <Search
                size={12}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/40"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索角色..."
                className="w-full h-7 pl-7 pr-2 rounded-md text-[11px] bg-background border border-border/30 focus:outline-none focus:border-foreground/20"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {focusedLocationId === null ? (
              <div className="px-4 py-6 text-center text-[11px] text-muted-foreground/50">
                请先聚焦一个地点
              </div>
            ) : relevantCharacters.length === 0 ? (
              <div className="px-4 py-6 text-center text-[11px] text-muted-foreground/50">
                当前位置无相关角色
              </div>
            ) : filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-[11px] text-muted-foreground/50">
                无匹配角色
              </div>
            ) : (
              <div className="py-1">
                {filtered.map((ch) => {
                  const initials = ch.name.slice(0, 2);
                  const isSelected = selectedCharacterId === ch.id;
                  return (
                    <div
                      key={ch.id}
                      className={cn(
                        'flex items-center gap-2 px-3 py-1.5 cursor-pointer transition-colors group',
                        isSelected
                          ? 'bg-foreground/[0.06] text-foreground/80'
                          : 'hover:bg-foreground/[0.03] text-foreground/60',
                      )}
                      onClick={() => handleCharacterClick(ch)}
                    >
                      <div
                        className={cn(
                          'w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-semibold flex-shrink-0',
                          isSelected
                            ? 'bg-foreground/15 text-foreground/80'
                            : 'bg-muted/60 text-muted-foreground/60',
                        )}
                      >
                        {initials}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium truncate">{ch.name}</div>
                        <div className="text-[9px] text-muted-foreground/50 truncate">
                          {ch.roleType} / {ch.status}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          openEditor('character', ch.id);
                        }}
                        className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground/30 hover:text-foreground/60 opacity-0 group-hover:opacity-100 transition-opacity bg-transparent border-none cursor-pointer"
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
            )}
          </div>
        </div>
      )}
    </div>
  );
}
