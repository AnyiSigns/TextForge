// 共享 SSE 读取器：封装 reader/decoder/buffer + JSON 解析循环，避免各流式接口重复实现。
// 调用方在 onEvent 中自行按 event.type 分发业务逻辑。

export type SSEEventHandler = (event: Record<string, unknown>) => void;

export async function readSSE(
  response: Response,
  onEvent: SSEEventHandler,
): Promise<void> {
  const reader = response.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        let event: Record<string, unknown>;
        try {
          event = JSON.parse(line.slice(6));
        } catch {
          continue; // skip malformed JSON
        }
        onEvent(event);
      }
    }
  } finally {
    reader.releaseLock();
  }
}
