'use client';

import { useRef, useCallback } from 'react';

interface TransitionState {
  entering: boolean;
  leaving: boolean;
  enterAlpha: number;
  leaveAlpha: number;
  prevLocationId: number | null;
}

export function useBackgroundTransition() {
  const stateRef = useRef<TransitionState>({
    entering: false,
    leaving: false,
    enterAlpha: 1,
    leaveAlpha: 0,
    prevLocationId: null,
  });

  const startTransition = useCallback((prevLocationId: number | null, duration = 300) => {
    const state = stateRef.current;
    state.entering = true;
    state.leaving = prevLocationId !== null;
    state.enterAlpha = 0;
    state.leaveAlpha = 1;
    state.prevLocationId = prevLocationId;

    const startTime = performance.now();

    function animate(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic

      const st = stateRef.current;
      st.enterAlpha = eased;
      st.leaveAlpha = 1 - eased;

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        st.entering = false;
        st.leaving = false;
        st.enterAlpha = 1;
        st.leaveAlpha = 0;
      }
    }

    requestAnimationFrame(animate);
  }, []);

  return { stateRef, startTransition };
}
