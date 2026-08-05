'use client';

import { useMemo, useState } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useEntityStore } from '@/features/map/stores/entityStore';
import { useMapStore } from '@/features/map/stores/mapStore';
import { useEditorStore } from '@/features/map/stores/editorStore';
import { ConfirmDialog } from '@/features/map/components/ConfirmDialog';
import type { Location } from '@/shared/api/types';

function findVisibleRoot(locId: number, locations: Location[]): Location | null {
  let current = locations.find((l) => l.id === locId) ?? null;
  while (current?.parentId) {
    const parent = locations.find((l) => l.id === current!.parentId);
    if (!parent) break;
    current = parent;
  }
  return current;
}

export function CharacterList() {
  const characters = useEntityStore((s) => s.characters);
  const removeCharacter = useEntityStore((s) => s.removeCharacter);
  const selectedId = useMapStore((s) => s.selectedCharacterId);
  const selectCharacter = useMapStore((s) => s.selectCharacter);
  const navigateTo = useMapStore((s) => s.navigateTo);
  const locations = useEntityStore((s) => s.locations);
  const openEditor = useEditorStore((s) => s.open);

  const [deleteId, setDeleteId] = useState<number | null>(null);

  const byType = useMemo(() => {
    const groups: Record<string, typeof characters> = {};
    for (const ch of characters) {
      const type = ch.roleType || '其他';
      if (!groups[type]) groups[type] = [];
      groups[type].push(ch);
    }
    return groups;
  }, [characters]);

  const entries = Object.entries(byType);

  if (characters.length === 0) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">角色</span>
          <button
            onClick={() => openEditor('character', null)}
            className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-foreground/60 bg-transparent border-none cursor-pointer transition-colors"
            title="添加角色"
          >
            <Plus size={12} strokeWidth={1.8} />
          </button>
        </div>
        <div className="text-[11px] text-muted-foreground/40 text-center py-3 transition-all duration-200">
          暂无角色，点击 + 添加
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {entries.map(([type, chars]) => (
        <div key={type}>
          <div className="flex items-center justify-between px-1 mb-1.5">
            <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">{type}</span>
            {entries[0][0] === type && (
              <button
                onClick={() => openEditor('character', null)}
                className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-foreground/60 bg-transparent border-none cursor-pointer transition-colors"
                title="添加角色"
              >
                <Plus size={12} strokeWidth={1.8} />
              </button>
            )}
          </div>
          <div className="space-y-0.5">
            {chars.map((ch) => {
              const initials = ch.name.slice(0, 2);
              const isSelected = selectedId === ch.id;
              return (
              <div
                key={ch.id}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md transition-all duration-200 cursor-pointer group hover:scale-[1.02] ${
                  isSelected
                    ? 'bg-foreground/[0.06] text-foreground/90'
                    : 'hover:bg-foreground/[0.04] text-foreground/60'
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
                    className="w-3.5 h-3.5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-foreground/60 hover:scale-110 opacity-0 group-hover:opacity-100 transition-all bg-transparent border-none cursor-pointer"
                    title="编辑"
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteId(ch.id);
                    }}
                    className="w-3.5 h-3.5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-red-500/60 hover:scale-110 opacity-0 group-hover:opacity-100 transition-all bg-transparent border-none cursor-pointer"
                    title="删除"
                  >
                    <Trash2 size={10} strokeWidth={1.8} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {deleteId !== null && (
        <ConfirmDialog
          title="删除角色"
          message={`确定要删除角色吗？此操作不可撤销。`}
          confirmLabel="删除"
          onConfirm={() => { removeCharacter(deleteId); setDeleteId(null); }}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}
