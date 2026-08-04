'use client';

import { useRef, useEffect } from 'react';
import type { MockCharacter, MockLocation } from '@/mocks/data';

interface RelationshipLinesProps {
  selectedCharacter: MockCharacter | null;
  relatedCharacters: MockCharacter[];
  characterPositions: Map<number, { x: number; y: number }>;
  locations: MockLocation[];
  width: number;
  height: number;
}

export function RelationshipLines({
  selectedCharacter,
  relatedCharacters,
  characterPositions,
  width,
  height,
}: RelationshipLinesProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

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

    if (!selectedCharacter) return;

    const fromPos = characterPositions.get(selectedCharacter.id);
    if (!fromPos) return;

    const fromX = fromPos.x * width;
    const fromY = fromPos.y * height;

    for (const target of relatedCharacters) {
      const toPos = characterPositions.get(target.id);
      if (!toPos) continue;

      const toX = toPos.x * width;
      const toY = toPos.y * height;

      // 查找关系类型
      const rel = selectedCharacter.relationshipChain.find(
        (r) => r.targetId === target.id,
      );

      // 绘制虚线连线
      ctx.beginPath();
      ctx.moveTo(fromX, fromY);

      // 贝塞尔曲线
      const midX = (fromX + toX) / 2;
      const midY = (fromY + toY) / 2 + 20;
      ctx.quadraticCurveTo(midX, midY, toX, toY);

      ctx.strokeStyle = 'rgba(28,27,26,0.15)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.stroke();

      // 关系标签
      if (rel) {
        ctx.fillStyle = 'rgba(28,27,26,0.4)';
        ctx.font = '10px "Noto Sans SC", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(rel.type, midX, midY - 4);
      }
    }
  }, [selectedCharacter, relatedCharacters, characterPositions, width, height]);

  if (!selectedCharacter) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: '100%', height: '100%' }}
    />
  );
}
