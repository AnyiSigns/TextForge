'use client';

import { useMemo, useCallback } from 'react';
import { LocationMarker } from './LocationMarker';
import { CharacterAvatar } from './CharacterAvatar';
import type { Location, Character } from '@/shared/api/types';
import { useEntityStore } from '@/features/map/stores/entityStore';
import { useMapStore } from '@/features/map/stores/mapStore';

interface VisibleCharInfo {
  character: Character;
  x: number;
  y: number;
  locationId: number;
}

interface MarkerLayerProps {
  children: Location[];
  d3Transform: { x: number; y: number; k: number };
  onEnterChild: (id: number) => void;
  onEditLocation: (id: number) => void;
  characterCounts: Map<number, number>;
  visibleCharacters: VisibleCharInfo[];
  selectedCharacterId: number | null;
  onSelectCharacter: (id: number | null) => void;
}

export function MarkerLayer({
  children,
  d3Transform,
  onEnterChild,
  onEditLocation,
  characterCounts,
  visibleCharacters,
  selectedCharacterId,
  onSelectCharacter,
}: MarkerLayerProps) {
  const allLocations = useEntityStore((s) => s.locations);

  const childMap = useMemo(() => {
    const map = new Map<number, boolean>();
    for (const loc of allLocations) {
      if (loc.parentId !== null) {
        map.set(loc.parentId, true);
      }
    }
    return map;
  }, [allLocations]);

  const getPosition = useCallback((loc: Location) => {
    const x = loc.positionX ?? 0.5;
    const y = loc.positionY ?? 0.5;
    return { x, y, hasPosition: loc.positionX !== null && loc.positionY !== null };
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <div
        className="absolute top-0 left-0 w-full h-full"
        style={{
          transform: `translate(${d3Transform.x}px, ${d3Transform.y}px) scale(${d3Transform.k})`,
          transformOrigin: '0 0',
        }}
      >
        {/* 地点标记 */}
        {children.map((loc) => {
          const { x, y } = getPosition(loc);
          const hasChildren = childMap.has(loc.id) || false;
          const charCount = characterCounts.get(loc.id) ?? 0;

          return (
            <div key={`loc-${loc.id}`} className="pointer-events-auto">
              <LocationMarker
                location={loc}
                x={x}
                y={y}
                hasChildren={hasChildren}
                onClick={() => onEnterChild(loc.id)}
                isSelected={false}
                characterCount={charCount}
                onEdit={() => onEditLocation(loc.id)}
              />
            </div>
          );
        })}

        {/* 角色头像 */}
        {visibleCharacters.map(({ character, x, y }) => (
          <div key={`char-${character.id}`} className="pointer-events-auto">
            <CharacterAvatar
              character={character}
              x={x}
              y={y}
              isSelected={selectedCharacterId === character.id}
              onClick={() =>
                onSelectCharacter(
                  selectedCharacterId === character.id ? null : character.id,
                )
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}
