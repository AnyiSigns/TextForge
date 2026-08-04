'use client';

import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { useMapStore } from '@/features/map/stores/mapStore';
import { useEntityStore } from '@/features/map/stores/entityStore';

interface BreadcrumbNavProps {
  focusedLocationId: number | null;
}

export function BreadcrumbNav({ focusedLocationId }: BreadcrumbNavProps) {
  const locations = useEntityStore((s) => s.locations);
  const navigateTo = useMapStore((s) => s.navigateTo);

  const path = useMemo(() => {
    if (focusedLocationId === null) return [];
    const chain: { id: number; name: string }[] = [];
    let current: { id: number; parentId: number | null; name: string } | undefined = locations.find((l) => l.id === focusedLocationId);
    while (current) {
      chain.unshift({ id: current.id, name: current.name });
      const pid = current.parentId;
      if (pid === null) break;
      current = locations.find((l) => l.id === pid) ?? undefined;
    }
    return chain;
  }, [focusedLocationId, locations]);

  if (path.length <= 1) return null;

  return (
    <div className="absolute top-4 right-4 z-30 flex items-center gap-0.5 px-3 py-1.5 rounded-xl bg-card/80 backdrop-blur-sm border border-border/40 shadow-sm">
      {path.map((seg, i) => (
        <span key={seg.id} className="flex items-center gap-0.5">
          {i > 0 && (
            <ChevronRight size={10} className="text-muted-foreground/40 flex-shrink-0" />
          )}
          <button
            onClick={() => navigateTo(seg.id)}
            className={`text-[11px] bg-transparent border-none cursor-pointer transition-colors truncate max-w-[120px] ${
              i === path.length - 1
                ? 'text-foreground/70 font-medium'
                : 'text-muted-foreground/50 hover:text-foreground/60'
            }`}
          >
            {seg.name}
          </button>
        </span>
      ))}
    </div>
  );
}
