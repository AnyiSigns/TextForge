'use client';

import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, MapPin, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useEntityStore } from '@/features/map/stores/entityStore';
import { useMapStore } from '@/features/map/stores/mapStore';
import { useEditorStore } from '@/features/map/stores/editorStore';
import { ConfirmDialog } from '@/features/map/components/ConfirmDialog';
import type { Location } from '@/shared/api/types';

export function LocationTree() {
  const locations = useEntityStore((s) => s.locations);
  const removeLocation = useEntityStore((s) => s.removeLocation);
  const focusedLocationId = useMapStore((s) => s.focusedLocationId);
  const navigateTo = useMapStore((s) => s.navigateTo);
  const openEditor = useEditorStore((s) => s.open);

  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set([1]));
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const rootNodes = useMemo(
    () => locations.filter((l) => l.parentId === null),
    [locations],
  );

  const getChildren = (parentId: number) =>
    locations.filter((l) => l.parentId === parentId);

  const toggleExpand = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderNode = (loc: Location, depth: number) => {
    const children = getChildren(loc.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(loc.id);
    const isActive = focusedLocationId === loc.id;

    return (
      <div key={loc.id}>
        <div
          className={cn(
            'flex items-center gap-1 px-1 py-1.5 rounded-md transition-all duration-200 group hover:scale-[1.02]',
            isActive
              ? 'bg-foreground/[0.05] text-foreground/80'
              : 'text-foreground/60 hover:bg-foreground/[0.04]',
          )}
          style={{ paddingLeft: depth * 16 + 4 }}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (hasChildren) toggleExpand(loc.id);
            }}
            className="w-4 h-4 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-muted-foreground/40"
          >
            {hasChildren ? (
              isExpanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />
            ) : (
              <span className="w-3" />
            )}
          </button>

          <span
            className="flex-1 flex items-center gap-1.5 cursor-pointer text-[12px] truncate"
            onClick={() => navigateTo(loc.id)}
          >
            <MapPin size={11} className={cn(
              'flex-shrink-0',
              isActive ? 'text-foreground/50' : 'text-muted-foreground/40',
            )} />
            <span className="truncate">{loc.name}</span>
            <span className="text-[9px] text-muted-foreground/40 flex-shrink-0">{loc.type}</span>
          </span>

          {loc.alternateOfId !== null && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                const alt = locations.find((l) => l.id === loc.alternateOfId);
                if (alt) navigateTo(alt.id);
              }}
              className="w-5 h-5 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-muted-foreground/30 hover:text-foreground/50 transition-colors"
              title="切换到平行世界"
            >
              ⟳
            </button>
          )}

          <button
            onClick={(e) => {
              e.stopPropagation();
              openEditor('location', loc.id);
            }}
            className="w-3.5 h-3.5 flex items-center justify-center rounded text-muted-foreground/50 hover:text-foreground/60 hover:scale-110 opacity-0 group-hover:opacity-100 transition-all bg-transparent border-none cursor-pointer"
            title="编辑"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
            </svg>
          </button>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setDeleteId(loc.id);
            }}
            className="w-3.5 h-3.5 flex items-center justify-center rounded text-muted-foreground/50 hover:text-red-500/60 hover:scale-110 opacity-0 group-hover:opacity-100 transition-all bg-transparent border-none cursor-pointer"
            title="删除"
          >
            <Trash2 size={10} strokeWidth={1.8} />
          </button>
        </div>

        {hasChildren && isExpanded && (
          <div>
            {children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  if (locations.length === 0) {
    return (
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">地点</span>
          <button
            onClick={() => openEditor('location', null)}
            className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-foreground/60 bg-transparent border-none cursor-pointer transition-colors"
            title="添加地点"
          >
            <Plus size={12} strokeWidth={1.8} />
          </button>
        </div>
        <div className="text-[11px] text-muted-foreground/40 text-center py-3 transition-all duration-200">
          暂无地点，点击 + 添加
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between px-1 mb-1">
        <span className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider">地点</span>
        <button
          onClick={() => openEditor('location', null)}
          className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-foreground/60 bg-transparent border-none cursor-pointer transition-colors"
          title="添加地点"
        >
          <Plus size={12} strokeWidth={1.8} />
        </button>
      </div>
      {rootNodes.map((root) => renderNode(root, 0))}

      {deleteId !== null && (
        <ConfirmDialog
          title="删除地点"
          message="确定要删除该地点吗？关联的角色和事件将被更新。"
          confirmLabel="删除"
          onConfirm={() => { removeLocation(deleteId); setDeleteId(null); }}
          onCancel={() => setDeleteId(null)}
        />
      )}
    </div>
  );
}
