'use client';

import { useState, useMemo } from 'react';
import { ChevronRight, ChevronDown, MapPin } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useEntityStore } from '@/features/map/stores/entityStore';
import { useMapStore } from '@/features/map/stores/mapStore';
import { useEditorStore } from '@/features/map/stores/editorStore';
import type { MockLocation } from '@/mocks/data';

export function LocationTree() {
  const locations = useEntityStore((s) => s.locations);
  const focusedLocationId = useMapStore((s) => s.focusedLocationId);
  const navigateTo = useMapStore((s) => s.navigateTo);
  const openEditor = useEditorStore((s) => s.open);

  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set([1]));

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

  const renderNode = (loc: MockLocation, depth: number) => {
    const children = getChildren(loc.id);
    const hasChildren = children.length > 0;
    const isExpanded = expandedIds.has(loc.id);
    const isActive = focusedLocationId === loc.id;

    return (
      <div key={loc.id}>
        <div
          className={cn(
            'flex items-center gap-1 px-1 py-1.5 rounded-md transition-colors group',
            isActive
              ? 'bg-foreground/[0.05] text-foreground/80'
              : 'text-foreground/60 hover:bg-foreground/[0.03]',
          )}
          style={{ paddingLeft: depth * 16 + 4 }}
        >
          {/* 展开/折叠 */}
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

          {/* 图标+名称 */}
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

          {/* 平行世界切换 */}
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

          {/* 编辑按钮 */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              openEditor('location', loc.id);
            }}
            className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground/30 hover:text-foreground/50 opacity-0 group-hover:opacity-100 transition-opacity bg-transparent border-none cursor-pointer"
            title="编辑"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/>
            </svg>
          </button>
        </div>

        {/* 子节点 */}
        {hasChildren && isExpanded && (
          <div>
            {children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-0.5">
      {rootNodes.map((root) => renderNode(root, 0))}
    </div>
  );
}
