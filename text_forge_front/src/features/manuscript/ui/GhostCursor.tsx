'use client';

import { useEffect } from 'react';
import { motion, useAnimation } from 'framer-motion';

interface GhostCursorProps {
  active?: boolean;
  stalled?: boolean;
}

export function GhostCursor({ active, stalled }: GhostCursorProps) {
  const cursorControls = useAnimation();
  const dotsControls = useAnimation();

  useEffect(() => {
    if (!active) return;
    cursorControls.start({
      opacity: [1, 0, 1],
      transition: { duration: 1.2, repeat: Infinity, ease: 'easeInOut' },
    });
  }, [active, cursorControls]);

  useEffect(() => {
    if (!stalled) {
      dotsControls.set({ opacity: 0, y: 0 });
      return;
    }
    dotsControls.start({
      opacity: [0, 1, 0],
      y: [0, -2, 0],
      transition: { duration: 1.4, repeat: Infinity, ease: 'easeInOut' },
    });
  }, [stalled, dotsControls]);

  if (!active) return null;

  return (
    <span className="inline-flex items-center gap-1 ml-1 align-middle">
      <motion.span animate={cursorControls} className="inline-block w-[2px] h-4 bg-primary/70 rounded-full" />
      {stalled && (
        <motion.span animate={dotsControls} className="inline-flex gap-0.5 text-muted-foreground/70">
          <span className="text-[10px] leading-none">.</span>
          <span className="text-[10px] leading-none">.</span>
          <span className="text-[10px] leading-none">.</span>
        </motion.span>
      )}
    </span>
  );
}
