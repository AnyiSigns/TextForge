'use client';

import { useRef, useState, useEffect, useCallback, useMemo } from 'react';
import { useWorldMap } from '@/features/map/hooks/useWorldMap';
import { useMapStore } from '@/features/map/stores/mapStore';
import { useTimelineStore } from '@/features/map/stores/timelineStore';
import { useInitializerStore } from '@/features/map/stores/initializerStore';
import { useEntityStore } from '@/features/map/stores/entityStore';
import { StarField } from '@/features/map/components/StarField';
import { MapOverlay } from '@/features/map/components/MapOverlay';
import { RelationshipLines } from '@/features/map/components/RelationshipLines';
import { ZoomControls } from '@/features/map/components/ZoomControls';
import { LocationTooltip } from '@/features/map/components/LocationTooltip';
import { CharacterTooltip } from '@/features/map/components/CharacterTooltip';
import { BreadcrumbNav } from '@/features/map/components/BreadcrumbNav';
import { CreativeSettingSidebar } from '@/features/map/components/CreativeSettingSidebar';
import { Palette } from 'lucide-react';
import type { Location } from '@/shared/api/types';

export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  const allLocations = useEntityStore((s) => s.locations);
  const allCharacters = useEntityStore((s) => s.characters);
  const allSceneEvents = useEntityStore((s) => s.sceneEvents);
  const bookId = useEntityStore((s) => s.book?.id ?? 1);
  const loading = useEntityStore((s) => s.loading);
  const error = useEntityStore((s) => s.error);
  const clearError = useEntityStore((s) => s.clearError);

  const selectedCharacterId = useMapStore((s) => s.selectedCharacterId);
  const navigateTo = useMapStore((s) => s.navigateTo);
  const openInitializer = useInitializerStore((s) => s.open);
  const selectedEventId = useTimelineStore((s) => s.selectedEventId);

  const [hoveredCharId, setHoveredCharId] = useState<number | null>(null);
  const [creativeSettingOpen, setCreativeSettingOpen] = useState(false);

  const {
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
  } = useWorldMap(containerRef);

  // 地点索引：父链回溯按 id 直接命中，避免每层 find 造成 O(n²)
  const locationById = useMemo(() => {
    const map = new Map<number, Location>();
    for (const loc of allLocations) map.set(loc.id, loc);
    return map;
  }, [allLocations]);

  const maxDepth = useMemo(() => {
    let max = 0;
    for (const loc of allLocations) {
      let d = 0;
      let current: Location | null = loc;
      while (current != null && current.parentId != null) {
        d++;
        current = locationById.get(current.parentId) ?? null;
        if (d > 20) break;
      }
      if (d > max) max = d;
    }
    return max;
  }, [allLocations, locationById]);

  const mismatchInfo = useMemo(() => {
    if (!selectedEventId || !focusedLocation) return null;
    const event = allSceneEvents.find((e) => e.id === selectedEventId);
    if (!event || !event.locationId) return null;

    if (event.locationId === focusedLocation.id) return null;

    let current: Location | null = locationById.get(event.locationId) ?? null;
    while (current) {
      if (current.id === focusedLocation.id) return null;
      if (!current.parentId) break;
      current = locationById.get(current.parentId) ?? null;
    }

    const eventLoc = locationById.get(event.locationId);
    return {
      eventTitle: event.title,
      locationName: eventLoc?.name ?? '未知地点',
      locationId: event.locationId,
    };
  }, [selectedEventId, focusedLocation, allSceneEvents, locationById]);

  const characterPositions = useMemo(() => {
    const map = new Map<number, { x: number; y: number }>();
    for (const p of characterPlacements) {
      map.set(p.character.id, {
        x: p.screenX / dimensions.width,
        y: p.screenY / dimensions.height,
      });
    }
    return map;
  }, [characterPlacements, dimensions]);

  const selectedCharacter = useMemo(
    () => allCharacters.find((c) => c.id === selectedCharacterId) ?? null,
    [allCharacters, selectedCharacterId],
  );

  const relatedCharacters = useMemo(() => {
    if (!selectedCharacter) return [];
    const targetIds = selectedCharacter.relationshipChain?.map((r) => r.targetId) ?? [];
    return allCharacters.filter((c) => targetIds.includes(c.id) && characterPositions.has(c.id));
  }, [selectedCharacter, allCharacters, characterPositions]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({ width, height });
      }
    });

    observer.observe(container);
    setDimensions({ width: container.clientWidth, height: container.clientHeight });

    return () => observer.disconnect();
  }, []);

  const handleZoomIn = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    node.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, ctrlKey: true }));
  }, []);

  const handleZoomOut = useCallback(() => {
    const node = containerRef.current;
    if (!node) return;
    node.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, ctrlKey: true }));
  }, []);

  const hoveredLocation = useMemo(() => {
    if (hoveredLocId === null) return null;
    return visibleLocations.find((l) => l.id === hoveredLocId) ?? null;
  }, [hoveredLocId, visibleLocations]);

  const hoveredLocScreen = useMemo(() => {
    if (!hoveredLocation) return { sx: 0, sy: 0 };
    return worldToScreen(hoveredLocation.cx, hoveredLocation.cy);
  }, [hoveredLocation, worldToScreen]);

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#0d0d1a]">
      <StarField
        visibleLocations={visibleLocations}
        d3Transform={d3Transform}
        hoveredLocId={hoveredLocId}
        focusedLocation={focusedLocation}
        worldLocations={worldLocations}
        width={dimensions.width}
        height={dimensions.height}
      />

      <BreadcrumbNav focusedLocationId={focusedLocation?.id ?? focusedLocationId} />

      <div
        ref={containerRef}
        className="absolute inset-0"
        style={{ touchAction: 'none' }}
      >
        <MapOverlay
          visibleLocations={visibleLocations}
          characterPlacements={characterPlacements}
          d3Transform={d3Transform}
          zoomTo={zoomTo}
          hoveredLocId={hoveredLocId}
          setHoveredLocId={setHoveredLocId}
          hoveredCharId={hoveredCharId}
          setHoveredCharId={setHoveredCharId}
          selectedCharacterId={selectedCharacterId}
        />
      </div>

      <RelationshipLines
        selectedCharacter={selectedCharacter}
        relatedCharacters={relatedCharacters}
        characterPositions={characterPositions}
        locations={allLocations}
        width={dimensions.width}
        height={dimensions.height}
      />

      {hoveredLocation && (
        <LocationTooltip
          name={hoveredLocation.name}
          type={hoveredLocation.type}
          description={hoveredLocation.description}
          screenX={hoveredLocScreen.sx}
          screenY={hoveredLocScreen.sy}
          visible={true}
        />
      )}

      {hoveredCharId !== null && characterPlacements.some((p) => p.character.id === hoveredCharId) && (
        <CharacterTooltip
          name={characterPlacements.find((p) => p.character.id === hoveredCharId)!.character.name}
          roleType={characterPlacements.find((p) => p.character.id === hoveredCharId)!.character.roleType}
          status={characterPlacements.find((p) => p.character.id === hoveredCharId)!.character.status}
          screenX={characterPlacements.find((p) => p.character.id === hoveredCharId)!.screenX}
          screenY={characterPlacements.find((p) => p.character.id === hoveredCharId)!.screenY}
          visible={true}
        />
      )}

      {allLocations.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30">
          <div className="pointer-events-auto bg-card/95 backdrop-blur-md border border-border/50 rounded-2xl shadow-xl px-8 py-6 text-center">
            <div className="text-4xl mb-3 opacity-25">✦</div>
            <div className="text-sm font-medium text-foreground/80 mb-1">开始构建你的世界</div>
            <div className="text-xs text-muted-foreground mb-5">使用初始化器自动生成世界观、地点、角色等</div>
            <button
              onClick={openInitializer}
              className="h-9 px-6 rounded-xl text-xs font-medium bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer"
            >
              打开初始化器
            </button>
          </div>
        </div>
      )}

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center z-30 bg-background/30">
          <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground/50 rounded-full animate-spin" />
        </div>
      )}

      {error && (
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2 rounded-xl bg-red-50 border border-red-200 shadow-lg text-xs text-red-700">
          <span>{error}</span>
          <button
            onClick={clearError}
            className="text-red-500 hover:text-red-700 bg-transparent border-none cursor-pointer font-medium"
          >
            ✕
          </button>
        </div>
      )}

      <ZoomControls
        depth={focusedLocation ? depth : 0}
        maxDepth={maxDepth}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onGoBack={zoomOut}
        canGoBack={canZoomOut}
        canZoomIn={d3Transform.k < 20}
        canZoomOut={d3Transform.k > 0.15}
        locationName={focusedLocation?.name ?? '—'}
      />

      {!creativeSettingOpen && (
        <button
          onClick={() => setCreativeSettingOpen(true)}
          className="absolute top-24 right-0 z-40 w-9 h-9 flex items-center justify-center bg-card/90 backdrop-blur-sm border border-border/50 rounded-l-xl shadow-sm cursor-pointer text-muted-foreground/60 hover:text-foreground transition-colors"
          title="创作设定"
        >
          <Palette size={14} strokeWidth={1.5} />
        </button>
      )}
      {creativeSettingOpen && (
        <div className="absolute top-0 right-0 z-50 h-full">
          <CreativeSettingSidebar
            bookId={bookId}
            onClose={() => setCreativeSettingOpen(false)}
          />
        </div>
      )}

      {mismatchInfo && (
        <div
          className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 px-4 py-2 rounded-xl bg-card/95 backdrop-blur-md border border-border/60 shadow-lg text-xs"
          style={{ animation: 'marker-fade-in 0.3s ease-out' }}
        >
          <span className="text-muted-foreground/70">
            当前事件 <span className="text-foreground/80 font-medium">{mismatchInfo.eventTitle}</span>
            发生在 <span className="text-foreground/80 font-medium">{mismatchInfo.locationName}</span>
          </span>
          <button
            onClick={() => {
              if (mismatchInfo.locationId) {
                navigateTo(mismatchInfo.locationId);
              }
            }}
            className="px-2.5 py-1 rounded-md text-[11px] font-medium bg-foreground/10 text-foreground/70 hover:bg-foreground/15 border-none cursor-pointer transition-colors"
          >
            跳转查看
          </button>
        </div>
      )}

      <style jsx global>{`
        @keyframes marker-fade-in {
          from { opacity: 0; transform: translate(-50%, 8px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>
  );
}
