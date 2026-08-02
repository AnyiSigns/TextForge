import { getItem, setItem } from '@/lib/storage/indexedDB';

const MODEL_CONFIG_KEY = 'tf_model_config';

export type RoleModelConfig = {
  adapter: string;
  base_url: string;
  api_key: string;
  model_id: string;
};

export type ModelConfig = {
  textRoleModels: Record<string, RoleModelConfig>;
  embeddingModel?: RoleModelConfig;
  visionModel?: RoleModelConfig;
};

export async function fetchModelConfig(): Promise<ModelConfig> {
  const raw = await getItem<ModelConfig>(MODEL_CONFIG_KEY);
  return raw ?? { textRoleModels: {} };
}

export async function saveModelConfig(config: ModelConfig): Promise<void> {
  await setItem(MODEL_CONFIG_KEY, config);
}

export async function testModelConnection(body: {
  adapter: string;
  base_url: string;
  api_key: string;
  model_id: string;
}): Promise<{ ok: boolean; content?: string }> {
  const res = await fetch('/api/models/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `HTTP ${res.status}`);
  }
  return res.json();
}
