'use client';

import { useRef, useEffect } from 'react';
import type { Location } from '@/shared/api/types';

const DEPTH_GRADIENTS: Record<number, { from: string; to: string }> = {
  0: { from: '#0d0d1a', to: '#1a1a2e' },
  1: { from: '#1a1a2e', to: '#16213e' },
  2: { from: '#16213e', to: '#0f3460' },
  3: { from: '#1a1816', to: '#2d2a27' },
  4: { from: '#2d2a27', to: '#3a3734' },
  5: { from: '#3a3734', to: '#4a4744' },
  6: { from: '#e8e5e0', to: '#f4f3f0' },
};

interface BackgroundLayerProps {
  location: Location | null;
  depth: number;
  width: number;
  height: number;
  d3Transform: { x: number; y: number; k: number };
  enterAlpha?: number;
  leaveAlpha?: number;
}

export function BackgroundLayer({
  location,
  depth,
  width,
  height,
  d3Transform,
  enterAlpha = 1,
}: BackgroundLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const prevDepthRef = useRef(depth);

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

    if (!location) return;

    const gradientInfo = DEPTH_GRADIENTS[depth] ?? DEPTH_GRADIENTS[0];

    ctx.save();
    ctx.translate(d3Transform.x, d3Transform.y);
    ctx.scale(d3Transform.k, d3Transform.k);

    // 背景渐变
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, gradientInfo.from);
    grad.addColorStop(1, gradientInfo.to);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // 装饰网格
    drawGrid(ctx, width, height, depth);

    // 中心文字标签
    drawLocationLabel(ctx, location.name, location.type, width, height, depth);

    ctx.restore();
  }, [location, depth, width, height, d3Transform]);

  useEffect(() => {
    prevDepthRef.current = depth;
  }, [depth]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0"
      style={{
        width: '100%',
        height: '100%',
        opacity: enterAlpha,
      }}
    />
  );
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  depth: number,
) {
  const step = depth <= 2 ? 80 : 40;
  ctx.strokeStyle = depth >= 5
    ? 'rgba(28,27,26,0.06)'
    : 'rgba(255,255,255,0.03)';
  ctx.lineWidth = 0.5;

  ctx.beginPath();
  for (let x = step; x < w; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
  }
  for (let y = step; y < h; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
  }
  ctx.stroke();

  // 随机散点（星点效果）
  if (depth <= 3) {
    const dotCount = depth <= 1 ? 60 : 30;
    for (let i = 0; i < dotCount; i++) {
      const px = (i * 7907 + 331) % w;
      const py = (i * 6353 + 773) % h;
      const alpha = 0.15 + (i % 3) * 0.1;
      const size = (i % 3 === 0) ? 1.5 : 0.8;
      ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawLocationLabel(
  ctx: CanvasRenderingContext2D,
  name: string,
  type: string,
  w: number,
  h: number,
  depth: number,
) {
  const isLight = depth >= 5;
  const cx = w / 2;
  const cy = h / 2;

  // 圆环
  ctx.strokeStyle = isLight
    ? 'rgba(28,27,26,0.08)'
    : 'rgba(255,255,255,0.06)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, 60, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, 80, 0, Math.PI * 2);
  ctx.stroke();

  // 地点名
  ctx.font = `${isLight ? '600 ' : '500 '}18px "Noto Serif SC", serif`;
  ctx.fillStyle = isLight
    ? 'rgba(28,27,26,0.35)'
    : 'rgba(255,255,255,0.25)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, cx, cy - 8);

  // 类型标签
  ctx.font = '12px "Noto Sans SC", sans-serif';
  ctx.fillStyle = isLight
    ? 'rgba(28,27,26,0.2)'
    : 'rgba(255,255,255,0.12)';
  ctx.fillText(type, cx, cy + 16);
}
