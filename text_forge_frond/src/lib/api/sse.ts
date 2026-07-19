// src/lib/api/sse.ts
import { API_URL } from '@/lib/config/env';

export interface SseEvent {
  type?: string;
  content?: string;
  agent?: string;
  [key: string]: unknown;
}

export function useSse(
  url: string,
  onEvent: (event: SseEvent) => void,
  onError?: (error: Error) => void,
  options?: { maxRetries?: number; retryDelay?: number }
): {
  connect: () => void;
  disconnect: () => void;
  isConnected: () => boolean;
} {
  const maxRetries = options?.maxRetries ?? 5;
  const retryDelay = options?.retryDelay ?? 2000;
  let abortController: AbortController | null = null;
  let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryCount = 0;
  let closed = false;

  const clearRetry = () => {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  };

  const connect = async () => {
    if (abortController || closed) return;
    abortController = new AbortController();

    const attempt = async () => {
      try {
        const response = await fetch(`${API_URL}${url}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: abortController?.signal,
        });

        if (!response.ok) {
          throw new Error(`SSE connection failed: ${response.status}`);
        }

        if (!response.body) {
          throw new Error('No response body');
        }

        reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (!line.startsWith('data: ')) continue;
            const data = line.slice(6);
            if (data === '[DONE]') continue;
            try {
              onEvent(JSON.parse(data));
            } catch {
              // Ignore non-JSON lines
            }
          }
        }
        retryCount = 0;
      } catch (error) {
        if (abortController?.signal.aborted || closed) return;

        retryCount++;
        if (retryCount <= maxRetries) {
          retryTimer = setTimeout(() => void attempt(), retryDelay * retryCount);
        } else {
          const err = error instanceof Error ? error : new Error(String(error));
          onError?.(err);
        }
      } finally {
        // 仅在非断开场景下复位连接句柄；断开由 disconnect 统一清理
        if (!(abortController?.signal.aborted || closed)) {
          abortController = null;
          reader = null;
        }
      }
    };

    await attempt();
  };

  const disconnect = () => {
    closed = true;
    clearRetry();
    if (reader) {
      reader.cancel().catch(() => {});
      reader = null;
    }
    if (abortController) {
      abortController.abort();
      abortController = null;
    }
  };

  return {
    connect,
    disconnect,
    isConnected: () => abortController !== null && !closed,
  };
}