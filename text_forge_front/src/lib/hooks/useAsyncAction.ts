// src/lib/hooks/useAsyncAction.ts
// 异步操作 Hook：封装 loading/error 状态管理。

import { useState, useCallback, useRef } from 'react';

interface UseAsyncActionOptions {
  onSuccess?: (result: unknown) => void;
  onError?: (error: Error) => void;
}

interface UseAsyncActionReturn<T> {
  execute: (...args: unknown[]) => Promise<T | undefined>;
  loading: boolean;
  error: Error | null;
  result: T | null;
  reset: () => void;
}

export function useAsyncAction<T = unknown>(
  asyncFn: (...args: unknown[]) => Promise<T>,
  options: UseAsyncActionOptions = {},
): UseAsyncActionReturn<T> {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [result, setResult] = useState<T | null>(null);
  const mountedRef = useRef(true);

  const execute = useCallback(
    async (...args: unknown[]) => {
      setLoading(true);
      setError(null);
      try {
        const data = await asyncFn(...args);
        if (mountedRef.current) {
          setResult(data);
          options.onSuccess?.(data);
        }
        return data;
      } catch (e) {
        const err = e instanceof Error ? e : new Error(String(e));
        if (mountedRef.current) {
          setError(err);
          options.onError?.(err);
        }
        return undefined;
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [asyncFn, options],
  );

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setResult(null);
  }, []);

  return { execute, loading, error, result, reset };
}