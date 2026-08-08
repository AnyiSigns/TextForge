'use client';

import { useState, useEffect, useRef } from 'react';

interface LocationTooltipProps {
  name: string;
  type: string;
  description: string;
  screenX: number;
  screenY: number;
  visible: boolean;
}

export function LocationTooltip({
  name,
  type,
  description,
  screenX,
  screenY,
  visible,
}: LocationTooltipProps) {
  const [delayedShow, setDelayedShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      timerRef.current = setTimeout(() => setDelayedShow(true), 200);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      // 立即隐藏走派生（visible && delayedShow），此处复位延迟标记为合法的 effect 清理
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDelayedShow(false);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible]);

  // 立即隐藏由 visible 派生（不依赖 effect 中的同步 setState），延迟显示走 timer
  const show = visible && delayedShow;

  if (!show) return null;

  const desc = description.length > 50
    ? description.slice(0, 50) + '...'
    : description;

  return (
    <div
      className="absolute z-40 bg-card/95 backdrop-blur-md border border-border/50 rounded-lg px-3 py-2 shadow-lg pointer-events-none"
      style={{
        left: screenX + 12,
        top: screenY + 12,
        maxWidth: 220,
      }}
    >
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-[12px] font-medium text-foreground/80">{name}</span>
        <span className="text-[10px] text-muted-foreground/50">{type}</span>
      </div>
      <div className="text-[11px] text-muted-foreground/60 leading-snug">{desc}</div>
    </div>
  );
}
