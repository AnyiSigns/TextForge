'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import * as d3 from 'd3';
import { useMapStore } from '@/features/map/stores/mapStore';
import { useEntityStore } from '@/features/map/stores/entityStore';

export function useMapZoom(containerRef: React.RefObject<HTMLDivElement | null>) {
  const zoomRef = useRef<d3.ZoomBehavior<Element, unknown> | null>(null);
  const [d3Transform, setD3Transform] = useState(d3.zoomIdentity);
  const focusedLocationId = useMapStore((s) => s.focusedLocationId);
  const navigateTo = useMapStore((s) => s.navigateTo);
  const goBack = useMapStore((s) => s.goBack);
  const locations = useEntityStore((s) => s.locations);

  const currentLocation = locations.find((l) => l.id === focusedLocationId) ?? locations[0] ?? null;
  const depth = currentLocation ? getLocationDepth(currentLocation, locations) : 0;

  const children = locations.filter((l) => l.parentId === focusedLocationId);

  /** 点击子级 → 进入更深层级 */
  const enterChild = useCallback(
    (childId: number) => {
      const target = locations.find((l) => l.id === childId);
      if (!target) return;

      if (!target.backgroundUrl && children.length === 0) return;

      navigateTo(childId);
      requestAnimationFrame(() => {
        const node = containerRef.current;
        if (!node || !zoomRef.current) return;
        (d3.select(node) as any).call(zoomRef.current.transform, d3.zoomIdentity);
      });
    },
    [locations, children.length, navigateTo, containerRef],
  );

  /** 返回上级 */
  const exitToParent = useCallback(() => {
    if (depth <= 0) return;
    goBack();
    requestAnimationFrame(() => {
      const node = containerRef.current;
      if (!node || !zoomRef.current) return;
      (d3.select(node) as any).call(zoomRef.current.transform, d3.zoomIdentity);
    });
  }, [depth, goBack, containerRef]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const zoom = d3
      .zoom<HTMLDivElement, unknown>()
      .scaleExtent([1, 3])
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
  }, [containerRef]);

  // 层级切换时重置 d3-zoom
  useEffect(() => {
    const node = containerRef.current;
    if (!node || !zoomRef.current) return;
    (d3.select(node) as any).call(zoomRef.current.transform, d3.zoomIdentity);
  }, [focusedLocationId, containerRef]);

  return {
    d3Transform,
    currentLocation,
    depth,
    children,
    enterChild,
    exitToParent,
  };
}

function getLocationDepth(
  location: NonNullable<ReturnType<typeof useEntityStore.getState>['locations'][number]>,
  locations: ReturnType<typeof useEntityStore.getState>['locations'],
): number {
  if (!location) return 0;
  let depth = 0;
  let current = location;
  while (current && current.parentId !== null) {
    const parent = locations.find((l) => l.id === current.parentId);
    if (!parent) break;
    current = parent;
    depth++;
  }
  return depth;
}
