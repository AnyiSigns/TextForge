'use client';

import { useMemo } from 'react';
import { useEntityStore } from '@/features/map/stores/entityStore';
import { useMapStore } from '@/features/map/stores/mapStore';
import { useTimelineStore } from '@/features/map/stores/timelineStore';
import type { Location, Character, SceneEvent } from '@/shared/api/types';

interface VisibleEntities {
  locations: Location[];
  characters: Character[];
  events: SceneEvent[];
  currentLocation: Location | null;
  depth: number;
}

export function useMapEntities(): VisibleEntities {
  const locations = useEntityStore((s) => s.locations);
  const characters = useEntityStore((s) => s.characters);
  const sceneEvents = useEntityStore((s) => s.sceneEvents);
  const focusedLocationId = useMapStore((s) => s.focusedLocationId);
  const cursorTs = useTimelineStore((s) => s.cursorTs);

  return useMemo(() => {
    const currentLoc = locations.find((l) => l.id === focusedLocationId) ?? null;

    const childLocations = locations.filter((l) => l.parentId === focusedLocationId);

    // 根据时间轴位置计算每个角色当前位置
    const charLocMap = new Map<number, number | null>();
    for (const ch of characters) {
      // 找到 story_ts <= cursorTs 且该角色参与的事件（按 story_ts 最大优先）
      const eventsForChar = sceneEvents
        .filter((e) => e.characterIds.includes(ch.id) && e.storyTs <= cursorTs)
        .sort((a, b) => b.storyTs - a.storyTs);

      const lastEvent = eventsForChar[0];
      if (lastEvent?.locationId) {
        charLocMap.set(ch.id, lastEvent.locationId);
      } else {
        // 回退到 base_location_id
        charLocMap.set(ch.id, ch.baseLocationId ?? ch.spawnLocationId ?? null);
      }
    }

    // 在当前层级的子级地点中，找出有角色关联的
    const relevantCharacters = characters.filter((ch) => {
      const locId = charLocMap.get(ch.id);
      if (!locId) return false;

      // 如果角色位置在当前层级直接子级中
      if (childLocations.some((l) => l.id === locId)) return true;

      // 如果角色位置在当前地点更深层级中 → 映射到当前层级直接子级祖先
      return childLocations.some((child) => isAncestorOf(child.id, locId, locations));
    });

    // 当前层级相关的场景事件
    const relevantEvents = sceneEvents.filter((e) => {
      if (!e.locationId) return false;
      return childLocations.some((l) => l.id === e.locationId) ||
        childLocations.some((child) => isAncestorOf(child.id, e.locationId, locations));
    });

    const depth = getDepth(currentLoc, locations);

    return {
      locations: childLocations,
      characters: relevantCharacters,
      events: relevantEvents,
      currentLocation: currentLoc,
      depth,
    };
  }, [locations, characters, sceneEvents, focusedLocationId, cursorTs]);
}

function getDepth(loc: Location | null, locations: Location[]): number {
  if (!loc) return 0;
  let depth = 0;
  let current: Location | null = loc;
  while (current?.parentId !== null) {
    current = locations.find((l) => l.id === current!.parentId) ?? null;
    depth++;
  }
  return depth;
}

function isAncestorOf(ancestorId: number, descendantId: number | null, locations: Location[]): boolean {
  if (!descendantId) return false;
  let current: Location | null = locations.find((l) => l.id === descendantId) ?? null;
  while (current) {
    if (current.parentId === ancestorId) return true;
    if (current.parentId === null) return false;
    const parentId = current.parentId;
    current = locations.find((l) => l.id === parentId) ?? null;
  }
  return false;
}
