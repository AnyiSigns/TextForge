// 个人库注入配置：控制「发送时是否检索本地个人库并随回合注入 agent」。
// 配置持久化在 IndexedDB keyval（与 tf_model_config 同款存储），跨会话生效。
import { getItem, setItem } from '@/lib/storage/indexedDB';

export interface RagInjectionConfig {
  /** 发送消息时是否检索个人库并注入（默认开） */
  enabled: boolean;
  /** 检索条数（1-5） */
  topK: number;
  /** 限定检索的文档 id 列表；空数组 = 检索全部个人文档 */
  docIds: string[];
}

const KEY = 'tf_personal_rag_config';

export const DEFAULT_RAG_INJECTION_CONFIG: RagInjectionConfig = {
  enabled: true,
  topK: 3,
  docIds: [],
};

// UI 提供的注入条数白名单（RagConfigPanel TOPK_OPTIONS），存储值必须落在此内
const TOPK_WHITELIST = [1, 2, 3, 5];

export async function getRagInjectionConfig(): Promise<RagInjectionConfig> {
  try {
    const raw = await getItem<RagInjectionConfig>(KEY);
    if (!raw) return DEFAULT_RAG_INJECTION_CONFIG;
    return {
      enabled: raw.enabled !== false,
      topK: TOPK_WHITELIST.includes(raw.topK) ? raw.topK : 3,
      docIds: Array.isArray(raw.docIds) ? raw.docIds : [],
    };
  } catch {
    return DEFAULT_RAG_INJECTION_CONFIG;
  }
}

export async function saveRagInjectionConfig(cfg: RagInjectionConfig): Promise<void> {
  await setItem(KEY, cfg);
}
