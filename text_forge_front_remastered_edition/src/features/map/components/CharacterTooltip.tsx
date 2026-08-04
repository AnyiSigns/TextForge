'use client';

import { useState, useEffect, useRef } from 'react';

interface CharacterTooltipProps {
  name: string;
  roleType: string;
  status: string;
  screenX: number;
  screenY: number;
  visible: boolean;
}

export function CharacterTooltip({
  name,
  roleType,
  status,
  screenX,
  screenY,
  visible,
}: CharacterTooltipProps) {
  const [show, setShow] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (visible) {
      timerRef.current = setTimeout(() => setShow(true), 200);
    } else {
      if (timerRef.current) clearTimeout(timerRef.current);
      setShow(false);
    }
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible]);

  if (!show) return null;

  return (
    <div
      className="absolute z-40 bg-card/95 backdrop-blur-md border border-border/50 rounded-lg px-3 py-2 shadow-lg pointer-events-none"
      style={{
        left: screenX + 12,
        top: screenY + 12,
        maxWidth: 180,
      }}
    >
      <div className="flex items-center gap-2 mb-0.5">
        <span className="text-[12px] font-medium text-foreground/80">{name}</span>
        <span className="text-[10px] text-muted-foreground/50">{roleType}</span>
      </div>
      <div className="text-[11px] text-muted-foreground/60 leading-snug">{status}</div>
    </div>
  );
}
