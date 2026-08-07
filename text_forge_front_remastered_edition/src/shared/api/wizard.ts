import { fetchModelConfig } from './models';
import { apiClient, API_BASE } from './client';
import { useAuthStore } from '@/shared/stores/authStore';

export interface CardField {
  key: string;
  value: string | string[];
}

export interface Card {
  title: string;
  fields: CardField[];
  card_type?: string;
}

export interface WizardCard {
  title: string;
  fields: Array<{ key: string; value: string }>;
}

export interface WizardGenerateResponse {
  step: number;
  cards: WizardCard[];
}

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

/**
 * 调用后端 AI 为初始化向导生成候选卡片。
 * Step 0: 返回表单填充数据（前端取第一项填入表单）。
 * Step 1-6: 返回候选卡片列表。
 */
export async function generateWizardCards(
  bookId: number,
  step: number,
  previousCards?: Array<{ step: number; title: string; fields: Array<{ key: string; value: string }> }>,
  excludeTitles?: string[],
  extraInstruction?: string,
): Promise<WizardCard[]> {
  const modelConfigData = await getModelConfigData();
  const { data } = await apiClient.post<WizardGenerateResponse>('/wizard/generate', {
    book_id: bookId,
    step,
    previous_cards: previousCards || [],
    exclude_titles: excludeTitles || [],
    model_config_data: modelConfigData,
    extra_instruction: extraInstruction,
  });
  return data.cards ?? [];
}

export interface WizardStreamEvent {
  type: 'meta' | 'delta' | 'volume_end' | 'done' | 'error';
  text?: string;
  fullText?: string;
  index?: number;
  totalVolumes?: number;
  step?: number;
  message?: string;
}

export interface StreamGenerateOptions {
  extraInstruction?: string;
  previousCards?: Array<{ step: number; title: string; fields: Array<{ key: string; value: string }> }>;
  onEvent?: (ev: WizardStreamEvent) => void;
  signal?: AbortSignal;
}

/**
 * 流式生成 Markdown 单份方案（Step 1-6，SSE）。
 * Step 4 大纲后端按卷分批生成，其余步骤单次生成，文本逐行推送。
 * Step 1 地点 / Step 2 角色 同样使用本接口（一次生成完整方案，前端解析落库）。
 */
export async function streamGenerateMarkdown(
  bookId: number,
  step: number,
  opts: StreamGenerateOptions = {},
): Promise<string> {
  const modelConfigData = await getModelConfigData();
  const token = useAuthStore.getState().accessToken;
  const resp = await fetch(`${API_BASE}/wizard/stream-generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    signal: opts.signal,
    body: JSON.stringify({
      book_id: bookId,
      step,
      model_config_data: modelConfigData,
      extra_instruction: opts.extraInstruction,
      previous_cards: opts.previousCards || [],
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
