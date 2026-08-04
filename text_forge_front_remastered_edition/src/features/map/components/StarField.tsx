'use client';

import { useRef, useEffect, useMemo } from 'react';
import type { WorldCoords } from '@/features/map/utils/coordinates';

interface StarFieldProps {
  visibleLocations: WorldCoords[];
  d3Transform: { x: number; y: number; k: number };
  hoveredLocId: number | null;
  width: number;
  height: number;
}

export function StarField({
  visibleLocations,
  d3Transform,
  hoveredLocId,
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

  const isLightBg = k > 10;

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

    if (k > 5) {
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

      const outerScale = isHovered ? 1.2 : 1;
      const innerAlphaBoost = isHovered ? 0.15 : 0;

      const colorBase = isLightBg ? '28,27,26' : '255,255,255';

      ctx.beginPath();
      ctx.arc(sx, sy, sr * 0.8 * outerScale, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${colorBase},0.12)`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(sx, sy, sr * 0.5 * outerScale, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${colorBase},${0.35 + innerAlphaBoost})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(sx, sy, sr * 0.12 * outerScale, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${colorBase},0.6)`;
      ctx.fill();

      if (sr > 20 && loc.name) {
        ctx.font = '11px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const labelColor = isLightBg
          ? `rgba(28,27,26,0.55)`
          : `rgba(255,255,255,0.45)`;
        ctx.fillStyle = labelColor;

        let displayName = loc.name;
        const m = ctx.measureText(displayName);
        if (m.width > 200) {
          displayName = displayName.slice(0, 8) + '...';
        }

        ctx.fillText(displayName, sx, sy - sr * 0.8 - 4);
      }
    }
  }, [visibleLocations, d3Transform, hoveredLocId, width, height, starDust, isLightBg, tx, ty, k]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
