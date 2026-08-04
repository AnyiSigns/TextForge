'use client';

import { useRef, useEffect, useMemo } from 'react';
import type { WorldCoords } from '@/features/map/utils/coordinates';

interface StarFieldProps {
  visibleLocations: WorldCoords[];
  d3Transform: { x: number; y: number; k: number };
  hoveredLocId: number | null;
  focusedLocation: WorldCoords | null;
  worldLocations: WorldCoords[];
  width: number;
  height: number;
}

type LocationVisualCategory = 'space' | 'galaxy' | 'planet' | 'continent' | 'city' | 'building' | 'room';

function classifyLocationType(type: string): LocationVisualCategory {
  const t = (type || '').toLowerCase();
  if (t.includes('宇宙') || t.includes('空间')) return 'space';
  if (t.includes('星系')) return 'galaxy';
  if (t.includes('行星') || t.includes('星')) return 'planet';
  if (t.includes('大陆')) return 'continent';
  if (t.includes('城') || t.includes('市') || t.includes('镇')) return 'city';
  if (t.includes('建筑') || t.includes('府') || t.includes('殿') || t.includes('堂')) return 'building';
  return 'room';
}

function getFillMultiplier(cat: LocationVisualCategory): number {
  const multipliers: Record<LocationVisualCategory, number> = {
    space: 0.5,
    galaxy: 1.2,
    planet: 1.0,
    continent: 0.8,
    city: 0.6,
    building: 0.4,
    room: 0.3,
  };
  return multipliers[cat];
}

function getStrokeParams(cat: LocationVisualCategory, isLightBg: boolean) {
  const strokeStyles: Record<LocationVisualCategory, { dash: number[]; width: number; alpha: number }> = {
    space: { dash: [8, 4], width: isLightBg ? 1 : 3, alpha: 0.15 },
    galaxy: { dash: [], width: isLightBg ? 1.2 : 1.5, alpha: 0.22 },
    planet: { dash: [], width: isLightBg ? 1.5 : 1.8, alpha: 0.2 },
    continent: { dash: [6, 4], width: isLightBg ? 1 : 1.2, alpha: 0.14 },
    city: { dash: [2, 4], width: 1, alpha: 0.12 },
    building: { dash: [1, 4], width: isLightBg ? 0.8 : 0.8, alpha: 0.1 },
    room: { dash: [], width: isLightBg ? 0.5 : 0, alpha: 0 },
  };
  return strokeStyles[cat];
}

export function StarField({
  visibleLocations,
  d3Transform,
  hoveredLocId,
  focusedLocation,
  worldLocations,
  width,
  height,
}: StarFieldProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { k, x: tx, y: ty } = d3Transform;

  const starDust = useMemo(() => {
    const points: { x: number; y: number; size: number; alpha: number }[] = [];
    for (let i = 0; i < 200; i++) {
      points.push({
        x: (i * 7907 + 331) % 2000,
        y: (i * 6353 + 773) % 2000,
        size: i % 3 === 0 ? 1.2 : 0.6,
        alpha: 0.15 + (i % 7) * 0.06,
      });
    }
    return points;
  }, []);

  const isLightBg = k >= 10;

  const ancestorChain = useMemo(() => {
    if (!focusedLocation) return [];
    const chain: WorldCoords[] = [];
    let current = focusedLocation;
    while (current && current.parentId !== null) {
      const parent = worldLocations.find((l) => l.id === current.parentId);
      if (parent) {
        chain.push(parent);
        current = parent;
      } else {
        break;
      }
    }
    return chain;
  }, [focusedLocation, worldLocations]);

  const visibleLocIds = useMemo(
    () => new Set(visibleLocations.map((l) => l.id)),
    [visibleLocations],
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.clearRect(0, 0, width, height);

    const bgAlpha = Math.max(0, Math.min(1, (k - 3) / 17));
    const darkGrad = ctx.createLinearGradient(0, 0, width, height);
    darkGrad.addColorStop(0, '#0d0d1a');
    darkGrad.addColorStop(1, '#1a1a2e');
    const lightGrad = ctx.createLinearGradient(0, 0, width, height);
    lightGrad.addColorStop(0, '#f4f3f0');
    lightGrad.addColorStop(1, '#e8e5e0');

    ctx.save();
    ctx.fillStyle = darkGrad;
    ctx.fillRect(0, 0, width, height);

    if (bgAlpha > 0) {
      ctx.globalAlpha = bgAlpha;
      ctx.fillStyle = lightGrad;
      ctx.fillRect(0, 0, width, height);
    }
    ctx.globalAlpha = 1;
    ctx.restore();

    if (k < 10) {
      const starAlpha = 1 - Math.min(1, (k - 3) / 7);
      ctx.save();
      ctx.translate(tx, ty);
      ctx.scale(k, k);
      for (const s of starDust) {
        ctx.fillStyle = `rgba(255,255,255,${s.alpha * starAlpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (k >= 5) {
      const gridAlpha = Math.min(0.08, (k - 5) / 15 * 0.08);
      const step = 40;
      ctx.strokeStyle = isLightBg
        ? `rgba(28,27,26,${gridAlpha})`
        : `rgba(255,255,255,${gridAlpha * 0.5})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      for (let x = step; x < width; x += step) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height);
      }
      for (let y = step; y < height; y += step) {
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
      }
      ctx.stroke();
    }

    for (const loc of visibleLocations) {
      const sx = loc.cx * k + tx;
      const sy = loc.cy * k + ty;
      const sr = loc.radius * k;
      const isHovered = hoveredLocId === loc.id;
      const cat = classifyLocationType(loc.type);

      const outerScale = isHovered ? 1.2 : 1;
      const alphaBoost = isHovered ? 0.1 : 0;

      const colorBase = isLightBg ? '28,27,26' : '255,255,255';

      const mainRadius = sr * 0.65 * outerScale;

      const baseAlpha = isLightBg ? 0.18 : 0.25;
      const gradientAlpha = baseAlpha * getFillMultiplier(cat);
      if (sr > 3) {
        const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, mainRadius);
        const fillEndColor = isLightBg
          ? `rgba(28,27,26,0)`
          : `rgba(255,255,255,0)`;
        grad.addColorStop(0, `rgba(${colorBase},${gradientAlpha + alphaBoost})`);
        grad.addColorStop(1, fillEndColor);
        ctx.beginPath();
        ctx.arc(sx, sy, mainRadius, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      if (k < 10 && cat !== 'room') {
        const glowRadius = sr * 0.65 * 1.15 * outerScale;
        ctx.beginPath();
        ctx.arc(sx, sy, glowRadius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${colorBase},0.04)`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      const stroke = getStrokeParams(cat, isLightBg);
      if (stroke.alpha > 0 && sr > 2) {
        ctx.beginPath();
        ctx.arc(sx, sy, mainRadius, 0, Math.PI * 2);
        ctx.setLineDash(stroke.dash);
        ctx.strokeStyle = `rgba(${colorBase},${stroke.alpha + alphaBoost})`;
        ctx.lineWidth = stroke.width * outerScale;
        ctx.stroke();
        ctx.setLineDash([]);
      }

      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(sr * 0.08, 2.5) * outerScale, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${colorBase},${0.55 + alphaBoost})`;
      ctx.fill();

      if (sr > 8 && loc.name) {
        const labelAlpha = Math.max(0, Math.min(1, (sr - 8) / 8)) * (isLightBg ? 0.45 : 0.35);
        ctx.save();
        ctx.shadowColor = isLightBg ? 'rgba(244,243,240,0.6)' : 'rgba(13,13,26,0.6)';
        ctx.shadowBlur = 3;
        ctx.font = `${Math.max(11, Math.min(20, sr * 0.15))}px "Noto Serif SC", serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = `rgba(${colorBase},${labelAlpha})`;

        let displayName = loc.name;
        const m = ctx.measureText(displayName);
        if (m.width > 200) {
          displayName = displayName.slice(0, 8) + '...';
        }
        ctx.fillText(displayName, sx, sy);
        ctx.restore();

        if (sr > 30 && loc.type) {
          ctx.font = '10px "Noto Sans SC", sans-serif';
          const typeAlpha = isLightBg ? 0.25 : 0.2;
          ctx.fillStyle = `rgba(${colorBase},${typeAlpha})`;
          ctx.fillText(loc.type, sx, sy + sr * 0.35);
        }
      }
    }

    for (let i = 0; i < ancestorChain.length; i++) {
      const loc = ancestorChain[i];
      if (visibleLocIds.has(loc.id)) continue;

      const sx = loc.cx * k + tx;
      const sy = loc.cy * k + ty;
      const sr = loc.radius * k;

      const ancestorAlpha = Math.max(0.08, 1 / (i + 1) * 0.25);
      const ancestorWidth = Math.max(0.5, 1.2 / (i + 1));

      ctx.beginPath();
      ctx.arc(sx, sy, sr * 0.65, 0, Math.PI * 2);
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = `rgba(${isLightBg ? '28,27,26' : '255,255,255'},${ancestorAlpha})`;
      ctx.lineWidth = ancestorWidth;
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }, [visibleLocations, d3Transform, hoveredLocId, focusedLocation, ancestorChain, visibleLocIds, width, height, starDust, isLightBg, tx, ty, k]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
