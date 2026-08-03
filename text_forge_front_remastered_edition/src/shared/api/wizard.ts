import { fetchModelConfig } from './models';
import { apiClient } from './client';

export type StepType =
  | 'creative_setting'
  | 'locations'
  | 'characters'
  | 'character_relations'
  | 'timeline_foreshadowing'
  | 'plot_threads'
  | 'outline';

export interface CardField {
  key: string;
  value: string | string[];
}

export interface Card {
  title: string;
  fields: CardField[];
  card_type?: string;
}

export interface CardEvent {
  type: 'card';
  step: StepType;
  card_index: number;
  total: number;
  card: Card;
}

export interface DoneEvent {
  type: 'done';
  step: StepType;
  total: number;
}

export interface ErrorEvent {
  type: 'error';
  step: StepType;
  message: string;
}

export type WizardSSEEvent = CardEvent | DoneEvent | ErrorEvent;

async function getModelConfigData() {
  try {
    const cfg = await fetchModelConfig();
    const main = cfg.textRoleModels?.main;
    if (!main) return null;
    return {
      main_config: {
        adapter: main.adapter,
        base_url: main.base_url,
        api_key: main.api_key,
        model_id: main.model_id,
      },
    };
  } catch {
    return null;
  }
}

export async function streamWizard(
  endpoint: string,
  body: Record<string, unknown>,
  onCard: (card: Card, index: number, total: number) => void,
  onDone: (total: number) => void,
  onError: (msg: string) => void,
  abortSignal?: AbortSignal,
): Promise<void> {
  const modelConfigData = await getModelConfigData();
  
  const res = await fetch(apiClient.defaults.baseURL + endpoint, {
    method: 'POST',
    headers: apiClient.defaults.headers as Record<string, string>,
    body: JSON.stringify({ ...body, model_config_data: modelConfigData }),
    signal: abortSignal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }

  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const event: WizardSSEEvent = JSON.parse(line.slice(6));
            if (event.type === 'card') {
              onCard(event.card, event.card_index, event.total);
            } else if (event.type === 'done') {
              onDone(event.total);
              return;
            } else if (event.type === 'error') {
              onError(event.message);
              return;
            }
          } catch {
            // 跳过解析失败的行
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export async function generateCards(endpoint: string, body: Record<string, unknown>): Promise<{ cards: Card[] }> {
  const modelConfigData = await getModelConfigData();
  const res = await apiClient.post(endpoint, { ...body, model_config_data: modelConfigData });
  console.log(`[wizard] ${endpoint} 返回:`, res.data);
  return res.data;
}

export async function batchCreate(step: StepType, bookId: number, entities: Record<string, unknown>[]): Promise<{ created: Record<string, unknown[]> }> {
  const res = await apiClient.post('/wizard/batch-create', { step, book_id: bookId, entities });
  return res.data;
}
