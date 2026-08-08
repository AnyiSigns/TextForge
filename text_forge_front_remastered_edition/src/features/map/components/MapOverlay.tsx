'use client';

import { useRef, useCallback } from 'react';
import { useMapStore } from '@/features/map/stores/mapStore';
import { useEditorStore } from '@/features/map/stores/editorStore';
import type { WorldCoords } from '@/features/map/utils/coordinates';
import type { CharacterPlacement } from '@/features/map/hooks/useWorldMap';

interface MapOverlayProps {
  visibleLocations: WorldCoords[];
  characterPlacements: CharacterPlacement[];
  d3Transform: { x: number; y: number; k: number };
  zoomTo: (id: number) => void;
  hoveredLocId: number | null;
  setHoveredLocId: (id: number | null) => void;
  hoveredCharId: number | null;
  setHoveredCharId: (id: number | null) => void;
  selectedCharacterId: number | null;
}

export function MapOverlay({
  visibleLocations,
  characterPlacements,
  d3Transform,
  zoomTo,
  setHoveredLocId,
  setHoveredCharId,
  selectedCharacterId,
}: MapOverlayProps) {
  const selectCharacter = useMapStore((s) => s.selectCharacter);
  const syncFocus = useMapStore((s) => s.syncFocus);
  const openEditor = useEditorStore((s) => s.open);
  const mouseDownPos = useRef<{ x: number; y: number } | null>(null);

  const { x: tx, y: ty, k } = d3Transform;

  const handleLocationMouseDown = useCallback((e: React.MouseEvent) => {
    mouseDownPos.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleLocationMouseUp = useCallback(
    (locId: number) => (e: React.MouseEvent) => {
      const down = mouseDownPos.current;
      if (!down) return;
      const dx = e.clientX - down.x;
      const dy = e.clientY - down.y;
      mouseDownPos.current = null;
      if (Math.hypot(dx, dy) < 5) {
        zoomTo(locId);
        syncFocus(locId);
      }
    },
    [zoomTo, syncFocus],
  );

  const handleLocationDoubleClick = useCallback(
    (locId: number) => () => {
      openEditor('location', locId);
    },
    [openEditor],
  );

  const handleCharacterClick = useCallback(
    (chId: number) => (e: React.MouseEvent) => {
      e.stopPropagation();
      selectCharacter(selectedCharacterId === chId ? null : chId);
    },
    [selectCharacter, selectedCharacterId],
  );

  const handleCharacterDoubleClick = useCallback(
    (chId: number) => (e: React.MouseEvent) => {
      e.stopPropagation();
      openEditor('character', chId);
    },
    [openEditor],
  );

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={{ pointerEvents: 'none' }}
    >
      {visibleLocations.map((loc) => {
        const sx = loc.cx * k + tx;
        const sy = loc.cy * k + ty;
        const sr = loc.radius * k;
        const hitSize = Math.max(sr * 0.8 * 2, 24);

        return (
          <div
            key={`loc-hit-${loc.id}`}
            className="absolute cursor-pointer"
            style={{
              left: sx - hitSize / 2,
              top: sy - hitSize / 2,
              width: hitSize,
              height: hitSize,
              pointerEvents: 'auto',
            }}
            onMouseDown={handleLocationMouseDown}
            onMouseUp={handleLocationMouseUp(loc.id)}
            onDoubleClick={handleLocationDoubleClick(loc.id)}
            onMouseEnter={() => setHoveredLocId(loc.id)}
            onMouseLeave={() => setHoveredLocId(null)}
          />
        );
      })}

      {characterPlacements.map((p) => {
        const isSelected = selectedCharacterId === p.character.id;
        const initials = p.character.name.slice(0, 2);
        const sx = p.screenX;
        const sy = p.screenY;

        if (p.tier === 'overflow') {
          return (
            <div
              key={`char-overflow-${p.character.id}-${p.locationId}`}
              className="absolute cursor-pointer group"
              style={{
                left: sx - 14,
                top: sy - 6,
                pointerEvents: 'auto',
              }}
              onMouseEnter={() => setHoveredCharId(p.character.id)}
              onMouseLeave={() => setHoveredCharId(null)}
            >
              <div className="relative">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold bg-card/70 text-foreground/50 border-2 border-dashed border-border/40 transition-all duration-200 hover:border-foreground/30 hover:scale-105">
                  {initials}
                </div>
                {(p.overflowCount ?? 0) > 0 && (
                  <div className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] rounded-full bg-foreground/70 text-background text-[8px] font-bold flex items-center justify-center px-1 shadow-sm">
                    +{p.overflowCount}
                  </div>
                )}
              </div>
              {(p.overflowCount ?? 0) > 0 && (
                <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="bg-card/95 backdrop-blur-sm border border-border/50 rounded-lg px-3 py-2 shadow-lg text-[11px] whitespace-nowrap">
                    {p.clusterCharacters.map((c) => (
                      <div key={c.id} className="text-foreground/70 leading-relaxed">
                        {c.name}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          );
        }

        if (p.tier === 1) {
          return (
            <div
              key={`char-${p.character.id}`}
              className="absolute cursor-pointer group"
              style={{
                left: sx - 14,
                top: sy - 6,
                pointerEvents: 'auto',
              }}
              onClick={handleCharacterClick(p.character.id)}
              onDoubleClick={handleCharacterDoubleClick(p.character.id)}
              onMouseEnter={() => setHoveredCharId(p.character.id)}
              onMouseLeave={() => setHoveredCharId(null)}
            >
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold transition-all duration-200 border-2 shadow-sm ${
                  isSelected
                    ? 'bg-foreground text-background border-foreground scale-110'
                    : 'bg-card/90 text-foreground/70 border-border/60 hover:border-foreground/30 hover:scale-105'
                }`}
              >
                {initials}
              </div>
              {k > 15 && (
                <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/70">
                  {p.character.name}
                </div>
              )}
            </div>
          );
        }

        return (
          <div
            key={`char-cluster-${p.character.id}-${p.locationId}`}
            className="absolute cursor-pointer group"
            style={{
              left: sx - 14,
              top: sy - 6,
              pointerEvents: 'auto',
            }}
            onClick={handleCharacterClick(p.character.id)}
            onDoubleClick={handleCharacterDoubleClick(p.character.id)}
            onMouseEnter={() => setHoveredCharId(p.character.id)}
            onMouseLeave={() => setHoveredCharId(null)}
          >
            <div className="relative">
              <div
                className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-semibold transition-all duration-200 border-2 shadow-sm ${
                  isSelected
                    ? 'bg-foreground text-background border-foreground scale-110'
                    : 'bg-card/90 text-foreground/70 border-border/60 hover:border-foreground/30 hover:scale-105'
                }`}
              >
                {initials}
              </div>
              {p.clusterSize > 1 && (
                <div className="absolute -top-1.5 -right-2.5 min-w-[16px] h-[16px] rounded-full bg-foreground/70 text-background text-[8px] font-bold flex items-center justify-center px-1 shadow-sm cursor-default group">
                  +{p.clusterSize - 1}
                </div>
              )}
            </div>
            {p.clusterSize > 1 && (
              <div className="absolute top-full mt-1 left-1/2 -translate-x-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="bg-card/95 backdrop-blur-sm border border-border/50 rounded-lg px-3 py-2 shadow-lg text-[11px] whitespace-nowrap">
                  {p.clusterCharacters.map((c) => (
                    <div key={c.id} className="text-foreground/70 leading-relaxed">
                      {c.name}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
