'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import * as d3 from 'd3';
import { useMapStore } from '@/features/map/stores/mapStore';
import { useEntityStore } from '@/features/map/stores/entityStore';
import { useTimelineStore } from '@/features/map/stores/timelineStore';
import { getWorldCoords, getWorldCoordsMap } from '@/features/map/utils/coordinates';
import type { WorldCoords } from '@/features/map/utils/coordinates';
import type { MockCharacter, MockSceneEvent } from '@/mocks/data';

export interface CharacterPlacement {
  character: MockCharacter;
  screenX: number;
  screenY: number;
  worldX: number;
  worldY: number;
  tier: 1 | 2 | 'overflow';
  locationId: number | null;
  isRepresentative: boolean;
  clusterSize: number;
  clusterCharacters: MockCharacter[];
  overflowCount?: number;
}

interface UseWorldMapReturn {
  d3Transform: { x: number; y: number; k: number };
  visibleLocations: WorldCoords[];
  worldLocations: WorldCoords[];
  focusedLocationId: number | null;
  focusedLocation: WorldCoords | null;
  depth: number;
  zoomTo: (id: number) => void;
  zoomOut: () => void;
  canZoomOut: boolean;
  hoveredLocId: number | null;
  setHoveredLocId: (id: number | null) => void;
  worldToScreen: (cx: number, cy: number) => { sx: number; sy: number };
  characterPlacements: CharacterPlacement[];
}

function isVisible(c: WorldCoords, k: number): boolean {
  const sr = c.radius * k;
  return sr >= 3 && sr <= 600;
}

function deriveLocationFromEvents(
  charId: number,
  sceneEvents: MockSceneEvent[],
  cursorTs: number,
): number | null {
  const eventsForChar = sceneEvents
    .filter((e) => e.characterIds.includes(charId) && e.storyTs <= cursorTs)
    .sort((a, b) => b.storyTs - a.storyTs);
  return eventsForChar[0]?.locationId ?? null;
}

function findNearestVisibleAncestor(
  locId: number,
  visibleLocations: WorldCoords[],
  worldMap: Map<number, WorldCoords>,
): WorldCoords | null {
  const direct = visibleLocations.find((l) => l.id === locId);
  if (direct) return direct;

  let current = worldMap.get(locId);
  while (current && current.parentId !== null) {
    const ancestor = visibleLocations.find((l) => l.id === current!.parentId);
    if (ancestor) return ancestor;
    current = worldMap.get(current.parentId);
  }
  return null;
}

function worldSpaceSpread(
  charId: number,
  focusId: number | null,
  worldLocationsMap: Map<number, WorldCoords>,
): { wx: number; wy: number } {
  const focus = focusId ? worldLocationsMap.get(focusId) : null;
  if (!focus) return { wx: 0, wy: 0 };

  const angle = (charId * 137.508) % (2 * Math.PI);
  const dist = focus.radius * 0.15;
  return {
    wx: focus.cx + Math.cos(angle) * dist,
    wy: focus.cy + Math.sin(angle) * dist,
  };
}

export function useWorldMap(
  containerRef: React.RefObject<HTMLDivElement | null>,
): UseWorldMapReturn {
  const zoomRef = useRef<d3.ZoomBehavior<Element, unknown> | null>(null);
  const [d3Transform, setD3Transform] = useState(d3.zoomIdentity);
  const [hoveredLocId, setHoveredLocId] = useState<number | null>(null);

  const focusedLocationId = useMapStore((s) => s.focusedLocationId);
  const userDriven = useMapStore((s) => s.userDriven);
  const clearUserDriven = useMapStore((s) => s.clearUserDriven);
  const syncFocus = useMapStore((s) => s.syncFocus);

  const locations = useEntityStore((s) => s.locations);
  const characters = useEntityStore((s) => s.characters);
  const sceneEvents = useEntityStore((s) => s.sceneEvents);
  const cursorTs = useTimelineStore((s) => s.cursorTs);

  const worldLocations = useMemo(() => getWorldCoords(locations), [locations]);
  const worldLocationsMap = useMemo(() => getWorldCoordsMap(locations), [locations]);

  const k = d3Transform.k;

  const visibleLocations = useMemo(
    () => worldLocations.filter((c) => isVisible(c, k)),
    [worldLocations, k],
  );

  const focusedLocation = useMemo(() => {
    if (visibleLocations.length === 0) return null;

    const byScreenRadius = [...visibleLocations].sort(
      (a, b) => b.radius * k - a.radius * k,
    );
    const maxRadius = byScreenRadius[0].radius * k;
    const candidates = byScreenRadius.filter(
      (c) => c.radius * k > maxRadius * 0.99,
    );

    if (candidates.length === 1) return candidates[0];

    const vpCx = (containerRef.current?.clientWidth ?? 800) / 2;
    const vpCy = (containerRef.current?.clientHeight ?? 600) / 2;

    let best = candidates[0];
    let bestDist = Infinity;
    for (const c of candidates) {
      const sx = c.cx * k + d3Transform.x;
      const sy = c.cy * k + d3Transform.y;
      const dist = Math.hypot(sx - vpCx, sy - vpCy);
      if (dist < bestDist) {
        bestDist = dist;
        best = c;
      }
    }
    return best;
  }, [visibleLocations, k, d3Transform, containerRef]);

  const depth = focusedLocation?.depth ?? 0;

  const worldToScreen = useCallback(
    (cx: number, cy: number) => ({
      sx: cx * k + d3Transform.x,
      sy: cy * k + d3Transform.y,
    }),
    [k, d3Transform.x, d3Transform.y],
  );

  const zoomTo = useCallback(
    (id: number) => {
      const node = containerRef.current;
      if (!node || !zoomRef.current) return;

      const target = worldLocations.find((l) => l.id === id);
      if (!target) return;

      const vpW = node.clientWidth || 800;
      const vpH = node.clientHeight || 600;
      const scale = Math.max(0.15, vpW * 0.35 / target.radius);
      const tx = vpW / 2 - target.cx * scale;
      const ty = vpH / 2 - target.cy * scale;

      (d3.select(node) as any)
        .transition()
        .duration(600)
        .ease(d3.easeCubicInOut)
        .call(
          zoomRef.current.transform,
          d3.zoomIdentity.translate(tx, ty).scale(scale),
        );
    },
    [containerRef, worldLocations],
  );

  const zoomOut = useCallback(() => {
    if (!focusedLocation || focusedLocation.parentId === null) return;
    const parent = worldLocations.find((l) => l.id === focusedLocation.parentId);
    if (parent) zoomTo(parent.id);
  }, [focusedLocation, worldLocations, zoomTo]);

  const canZoomOut = focusedLocation !== null && focusedLocation.parentId !== null;

  const characterPlacements = useMemo((): CharacterPlacement[] => {
    if (characters.length === 0) return [];

    const visualFocusId = focusedLocation?.id ?? null;

    const descendantIds = new Set<number>();
    if (focusedLocation) {
      const stack = [focusedLocation.id];
      while (stack.length > 0) {
        const lid = stack.pop()!;
        for (const loc of worldLocations) {
          if (loc.parentId === lid) {
            descendantIds.add(loc.id);
            stack.push(loc.id);
          }
        }
      }
    }

    const extendedVisibleLocations = worldLocations.filter((c) => {
      const sr = c.radius * k;
      const isDescendant = descendantIds.has(c.id) || c.id === focusedLocation?.id;
      const minSr = isDescendant ? 1 : 3;
      return sr >= minSr && sr <= 600;
    });

    const clusters = new Map<
      number,
      { ch: MockCharacter[]; loc: WorldCoords }
    >();
    const tier1: CharacterPlacement[] = [];
    const worldSpreads = new Map<number, { wx: number; wy: number }>();

    for (const ch of characters) {
      const locId =
        deriveLocationFromEvents(ch.id, sceneEvents, cursorTs) ??
        ch.baseLocationId ??
        ch.spawnLocationId;

      if (locId === null || locId === undefined) continue;

      const nearestVisible = findNearestVisibleAncestor(
        locId,
        extendedVisibleLocations,
        worldLocationsMap,
      );

      if (
        nearestVisible === null ||
        nearestVisible.id === visualFocusId
      ) {
        const spread = worldSpaceSpread(ch.id, visualFocusId, worldLocationsMap);
        worldSpreads.set(ch.id, spread);
        tier1.push({
          character: ch,
          screenX: 0,
          screenY: 0,
          worldX: spread.wx,
          worldY: spread.wy,
          tier: 1,
          locationId: nearestVisible?.id ?? null,
          isRepresentative: true,
          clusterSize: 1,
          clusterCharacters: [ch],
        });
      } else {
        if (!clusters.has(nearestVisible.id)) {
          clusters.set(nearestVisible.id, {
            ch: [],
            loc: nearestVisible,
          });
        }
        clusters.get(nearestVisible.id)!.ch.push(ch);
      }
    }

    const placements: CharacterPlacement[] = [];

    if (tier1.length > 0) {
      const visualFocus = visualFocusId ? worldLocationsMap.get(visualFocusId) : null;
      if (tier1.length > 5 && visualFocus) {
        const visibleChars = tier1.slice(0, 4);
        for (const p of visibleChars) {
          placements.push(p);
        }
        const repChar = tier1[4];
        const offsetX = ((repChar.character.id * 7907) % 1000) / 1000 - 0.5;
        const offsetY = ((repChar.character.id * 6353) % 1000) / 1000 - 0.5;
        placements.push({
          character: repChar.character,
          screenX: 0,
          screenY: 0,
          worldX: visualFocus.cx + offsetX * visualFocus.radius * 0.1,
          worldY: visualFocus.cy + offsetY * visualFocus.radius * 0.1,
          tier: 'overflow',
          locationId: visualFocus.id,
          isRepresentative: true,
          clusterSize: tier1.length - 4,
          clusterCharacters: tier1.slice(4).map((p) => p.character),
          overflowCount: tier1.length - 4,
        });
      } else {
        for (const p of tier1) {
          placements.push(p);
        }
      }
    }

    for (const [, cluster] of clusters) {
      const { ch: chars, loc } = cluster;
      if (chars.length === 0) continue;

      const screen = worldToScreen(loc.cx, loc.cy);

      if (chars.length === 1) {
        placements.push({
          character: chars[0],
          screenX: screen.sx,
          screenY: screen.sy - loc.radius * k * 1.2,
          worldX: loc.cx,
          worldY: loc.cy - loc.radius * 1.2,
          tier: 2,
          locationId: loc.id,
          isRepresentative: true,
          clusterSize: 1,
          clusterCharacters: chars,
        });
      } else {
        const rep = chars.sort((a, b) => a.name.localeCompare(b.name))[0];
        placements.push({
          character: rep,
          screenX: screen.sx,
          screenY: screen.sy - loc.radius * k * 1.2,
          worldX: loc.cx,
          worldY: loc.cy - loc.radius * 1.2,
          tier: 2,
          locationId: loc.id,
          isRepresentative: true,
          clusterSize: chars.length,
          clusterCharacters: chars,
        });
      }
    }

    for (const p of placements) {
      if (p.tier === 1) {
        const screen = worldToScreen(p.worldX, p.worldY);
        p.screenX = screen.sx;
        p.screenY = screen.sy;
      } else if (p.tier === 'overflow') {
        const screen = worldToScreen(p.worldX, p.worldY);
        p.screenX = screen.sx;
        p.screenY = screen.sy;
      }
    }

    return placements;
  }, [
    characters,
    sceneEvents,
    cursorTs,
    worldLocations,
    worldLocationsMap,
    focusedLocation,
    worldToScreen,
    k,
  ]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const minRadius = worldLocations.length > 0
      ? Math.min(...worldLocations.map((l) => l.radius), 1)
      : 1;
    const maxScale = Math.max(200, (node.clientWidth || 800) * 0.35 / minRadius);

    const zoom = d3
      .zoom<HTMLDivElement, unknown>()
      .scaleExtent([0.15, maxScale])
      .wheelDelta((event) => -event.deltaY * 0.002)
      .on('zoom', (event) => {
        setD3Transform(event.transform);
      });

    (d3.select(node) as any).call(zoom);
    zoomRef.current = zoom as any;

    return () => {
      d3.select(node).on('.zoom', null);
      zoomRef.current = null;
    };
  }, [containerRef, worldLocations]);

  useEffect(() => {
    if (userDriven && focusedLocationId !== null) {
      const node = containerRef.current;
      zoomTo(focusedLocationId);
      setTimeout(() => clearUserDriven(), 700);
    }
  }, [focusedLocationId, userDriven, zoomTo, clearUserDriven, containerRef]);

  useEffect(() => {
    return () => {
      const node = containerRef.current;
      if (node) d3.select(node).interrupt();
    };
  }, [containerRef]);

  return {
    d3Transform,
    visibleLocations,
    worldLocations,
    focusedLocationId,
    focusedLocation,
    depth,
    zoomTo,
    zoomOut,
    canZoomOut,
    hoveredLocId,
    setHoveredLocId,
    worldToScreen,
    characterPlacements,
  };
}
