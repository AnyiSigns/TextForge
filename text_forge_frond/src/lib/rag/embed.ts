// src/lib/rag/embed.ts
//
// 浏览器端 embedding：用 @huggingface/transformers（transformers.js v3）在本地跑
// 中文向量模型，生成向量。
// - 默认 bge-base-zh-v1.5（768 维）；用户可在设置里切换档位（维度）。
// - 模型权重经同源代理 /hf/* 拉取（见 src/proxy.ts），由后端转发到国内镜像，
//   规避镜像站不支持 CORS 导致的浏览器端 Failed to fetch。
// - 首次从镜像 CDN 下载模型权重（约 30~320MB），之后由浏览器 Cache Storage 缓存，离线可用。
// - 单例 + 懒加载：只有真正用到个人库检索 / 登录后静默预热才初始化。

// 注意：transformers.js 在浏览器顶层初始化会访问 Node 环境，必须动态 import，
// 且只在浏览器端真正调用时才加载，避免污染页面 hydration。
import type { FeatureExtractionPipeline } from '@huggingface/transformers';

// 模型档位：维度越高语义越准，但下载体积/首次耗时越大。
export interface EmbedModelTier {
  id: string;
  label: string;
  model: string;     // transformers.js 模型 id
  dim: number;
  sizeMB: number;    // 近似下载体积，用于提示
  desc: string;
}

export const EMBED_TIERS: EmbedModelTier[] = [
  { id: 'small', label: '轻量（512 维）', model: 'Xenova/bge-small-zh-v1.5', dim: 512, sizeMB: 30, desc: '最快、最省空间，语义精度一般' },
  { id: 'base', label: '均衡（768 维）', model: 'Xenova/bge-base-zh-v1.5', dim: 768, sizeMB: 110, desc: '推荐：精度与体积平衡' },
  { id: 'large', label: '精准（1024 维）', model: 'Xenova/bge-large-zh-v1.5', dim: 1024, sizeMB: 320, desc: '最准，但下载慢、占内存' },
];

const DEFAULT_TIER_ID = 'base';

// 浏览器端权重经同源代理拉取（proxy.ts 转发到镜像源），无需在客户端写死镜像域名。
const MODEL_BASE_URL = '/hf/';

let currentTier: EmbedModelTier = EMBED_TIERS.find((t) => t.id === DEFAULT_TIER_ID)!;
let extractor: FeatureExtractionPipeline | null = null;
let loading: Promise<FeatureExtractionPipeline> | null = null;

export function getEmbedDim(): number {
  return currentTier.dim;
}

export function setEmbedTier(id: string) {
  const t = EMBED_TIERS.find((x) => x.id === id);
  if (!t || t.id === currentTier.id) return;
  // 切换档位：旧模型/索引失效，清空并交由调用方重建索引
  currentTier = t;
  extractor = null;
  loading = null;
}

export function getEmbedTier(): EmbedModelTier {
  return currentTier;
}

async function buildExtractor(onProgress?: (p: number) => void): Promise<FeatureExtractionPipeline> {
  // transformers.js v3 的 pipeline 返回类型联合过大，TS 无法表示（TS2590），
  // 用 any 取模块后再断言回 FeatureExtractionPipeline，运行时类型正确。
  const mod = await import('@huggingface/transformers');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { pipeline, env } = mod as any;
  // 浏览器端：权重走同源 /hf/ 代理，规避镜像站 CORS。
  if (typeof window !== 'undefined') {
    env.allowLocalModels = false;
    env.remoteHost = MODEL_BASE_URL;
  }
  const pipe = await pipeline('feature-extraction', currentTier.model, {
    progress_callback: onProgress
      ? (e: { status: string; progress?: number; file?: string }) => {
          if (e.status === 'progress' && typeof e.progress === 'number') {
            onProgress(Math.round(e.progress));
          }
        }
      : undefined,
  });
  return pipe as FeatureExtractionPipeline;
}

async function getExtractor(onProgress?: (p: number) => void): Promise<FeatureExtractionPipeline> {
  if (extractor) return extractor;
  // 失败清理：若上次下载失败，loading 会残留一个 rejected promise，
  // 不清空会导致后续调用复用失败结果、且不再发起新请求（无法重试）。
  const start = () =>
    buildExtractor(onProgress)
      .then((p) => { extractor = p; loading = null; return p; })
      .catch((e) => { loading = null; throw e; });
  if (!loading) {
    loading = start();
  }
  return loading;
}

// 文本 -> 向量（维度随档位）。normalize 后可直接做余弦相似度。
export async function embed(text: string): Promise<number[]> {
  const pipe = await getExtractor();
  const out = await pipe(text, { pooling: 'mean', normalize: true });
  return Array.from(out.data as Float32Array).slice(0, currentTier.dim);
}

export const EMBED_DIM = 768; // 默认值（base），运行时以 getEmbedDim() 为准

export function isEmbedReady(): boolean {
  return extractor !== null;
}

// 显式下载指定档位模型：切到该档、并发起下载（带进度回调）。
// 与 prewarmEmbed 共用 extractor 单例：若已就绪且档位一致直接返回，
// 否则强制清掉之前的加载锁重新下载，避免被静默预热的 loading 阻塞。
export async function downloadEmbedModel(id: string, onProgress?: (p: number) => void): Promise<boolean> {
  const t = EMBED_TIERS.find((x) => x.id === id);
  if (!t) throw new Error(`未知向量模型档位：${id}`);
  // 切换档位：若当前已是该档且已就绪，直接返回
  if (extractor && currentTier.id === id) return true;
  setEmbedTier(id);
  extractor = null;
  loading = null;
  await getExtractor(onProgress);
  return true;
}

// 登录后静默预热：后台下载并初始化默认档模型，不阻塞 UI。
// 失败静默忽略（用户真正检索时再按需加载，会再次容灾尝试）。
// 注意：预热与手动下载共用 loading 锁，手动下载会清掉该锁强制重下。
export async function prewarmEmbed(): Promise<void> {
  try {
    await getExtractor();
  } catch {
    /* 静默 */
  }
}
