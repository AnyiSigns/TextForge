'use client';

import { useCallback, useRef, useEffect } from 'react';

export function useTimelinePlayback(
  eventTimestamps: number[],
  onTick: (ts: number) => void,
) {
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const indexRef = useRef(0);

  const start = useCallback(() => {
    if (intervalRef.current) return;
    indexRef.current = 0;
    intervalRef.current = setInterval(() => {
      if (indexRef.current >= eventTimestamps.length) {
        stop();
        return;
      }
      onTick(eventTimestamps[indexRef.current]);
      indexRef.current++;
    }, 1500);
  }, [eventTimestamps, onTick]);

  const pause = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const stop = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    indexRef.current = 0;
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { start, pause, stop };
}
