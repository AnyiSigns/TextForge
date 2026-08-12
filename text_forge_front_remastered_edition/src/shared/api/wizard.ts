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
  /** done 事件的完整文本（snake_case，与后端契约一致；delta 累积为兜底） */
  full_text?: string;
  index?: number;
  /** meta 事件：本次新增卷数（Step4 卷进度条 total；非 Step4 恒为 1） */
  batch_volumes?: number;
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

/** 构建合并信号并挂载超时标记：超时触发时 timedOut=true（fetch 抛错名在不同环境可能是
 * AbortError 或 TimeoutError，仅凭 name 无法可靠区分，用标记判定）。 */
function buildSignal(
  signal: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal | undefined; timedOut: () => boolean } {
  if (!signal && timeoutMs <= 0) return { signal: undefined, timedOut: () => false };
  let timedOut = false;
  let timeoutSignal: AbortSignal | undefined;
  if (typeof AbortSignal.timeout === 'function' && timeoutMs > 0) {
    timeoutSignal = AbortSignal.timeout(timeoutMs);
    timeoutSignal.addEventListener('abort', () => {
      timedOut = true;
    });
  }
  if (signal && timeoutSignal && typeof AbortSignal.any === 'function') {
    return { signal: AbortSignal.any([signal, timeoutSignal]), timedOut: () => timedOut };
  }
  return { signal: signal ?? timeoutSignal, timedOut: () => timedOut };
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
  const { signal, timedOut } = buildSignal(opts.signal, timeoutMs);
  let resp: Response;
  try {
    resp = await fetch(`${API_BASE}/wizard/stream-generate`, {
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
  } catch (e) {
    if (timedOut()) throw new Error('AI 生成超时，请重试（可适当降低卷数或条目数量）');
    throw e;
  }
  if (!resp.ok || !resp.body) {
    throw new Error(`AI 生成失败（${resp.status}）`);
  }
  const reader = resp.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';
  let fullText = '';
  try {
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
          if (ev.type === 'done' && ev.full_text) fullText = ev.full_text;
          opts.onEvent?.(ev);
        } catch { /* 忽略无法解析的 SSE 消息 */ }
      }
    }
  } catch (e) {
    // 超时与用户取消共用 abort 通道，但语义不同：超时需给出可恢复的明确提示
    if (timedOut()) throw new Error('AI 生成超时，请重试（可适当降低卷数或条目数量）');
    throw e;
  }
  return fullText;
}
