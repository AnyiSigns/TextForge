import { fetchModelConfig } from './models';
import { API_BASE } from './client';
import { useAuthStore } from '@/shared/stores/authStore';

async function getModelConfigData() {
  try {
    const cfg = await fetchModelConfig();
    const main = cfg.textRoleModels?.main;
    if (!main) return null;
    const search = cfg.searchConfig;
    return {
      main_config: {
        adapter: main.adapter,
        base_url: main.base_url,
        api_key: main.api_key,
        model_id: main.model_id,
      },
      search_config: search && search.api_key
        ? { provider: search.provider || 'bocha', api_key: search.api_key }
        : undefined,
    };
  } catch {
    return null;
  }
}

export interface WizardStreamEvent {
  type: 'meta' | 'delta' | 'volume_end' | 'done' | 'error';
  text?: string;
  fullText?: string;
  index?: number;
  totalVolumes?: number;
  step?: number;
  mode?: 'init' | 'append';
  warnings?: string[];
  message?: string;
}

export type WizardMode = 'init' | 'append' | 'auto';

export interface StreamGenerateOptions {
  extraInstruction?: string;
  mode?: WizardMode;
  onEvent?: (ev: WizardStreamEvent) => void;
  signal?: AbortSignal;
  /** 流式请求总超时（毫秒），默认 120s；传 0 禁用 */
  timeoutMs?: number;
}

/** 合并调用方 signal 与超时 signal（低版本浏览器不支持 AbortSignal.any 时退化为仅调用方 signal）。 */
function mergeSignals(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal | undefined {
  if (!signal && timeoutMs <= 0) return undefined;
  if (typeof AbortSignal.timeout === 'function' && typeof AbortSignal.any === 'function') {
    const timeoutSignal = timeoutMs > 0 ? AbortSignal.timeout(timeoutMs) : undefined;
    if (signal && timeoutSignal) return AbortSignal.any([signal, timeoutSignal]);
    return signal ?? timeoutSignal;
  }
  return signal;
}

/**
 * 流式生成 Markdown 单份方案（Step 0-6，SSE，Markdown 传递）。
 * Step 4 大纲后端按卷分批生成，其余步骤单次生成，文本逐行推送。
 * mode=init/append/auto：初始化与追加共用同一端点；追加不覆盖已有数据。
 */
export async function streamGenerateMarkdown(
  bookId: number,
  step: number,
  opts: StreamGenerateOptions = {},
): Promise<string> {
  const modelConfigData = await getModelConfigData();
  const token = useAuthStore.getState().accessToken;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const signal = mergeSignals(opts.signal, timeoutMs);
  const resp = await fetch(`${API_BASE}/wizard/stream-generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal,
    body: JSON.stringify({
      bookId,
      step,
      mode: opts.mode ?? 'auto',
      modelConfig: modelConfigData,
      extraInstruction: opts.extraInstruction,
    }),
  });
  if (!resp.ok || !resp.body) {
    throw new Error(`AI 生成失败（${resp.status}）`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) !== -1) {
      const raw = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      if (!raw.startsWith('data:')) continue;
      try {
        const ev = JSON.parse(raw.slice(5).trim()) as WizardStreamEvent;
        if (ev.type === 'delta' && ev.text) fullText += ev.text;
        if (ev.type === 'done' && ev.fullText) fullText = ev.fullText;
        opts.onEvent?.(ev);
      } catch { /* 忽略无法解析的 SSE 消息 */ }
    }
  }
  return fullText;
}
