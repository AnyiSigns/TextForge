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
import { MODEL_PROXY_BASE } from '@/shared/api/client';
import { getItem, setItem } from '@/lib/storage/indexedDB';

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

// 浏览器端权重经后端代理拉取，避免浏览器直连 HuggingFace 被墙或触发 CORS。
// 后端统一走 huggingface.co / hf-mirror.com 取文件，前端无需感知镜像。
const MODEL_BASE_URL = MODEL_PROXY_BASE.replace(/\/$/, '');

let currentTier: EmbedModelTier = EMBED_TIERS.find((t) => t.id === DEFAULT_TIER_ID)!;
let extractor: FeatureExtractionPipeline | null = null;
let loading: Promise<FeatureExtractionPipeline> | null = null;

export function getEmbedDim(): number {
  return currentTier.dim;
}

export function setEmbedTier(id: string) {
  const t = EMBED_TIERS.find((x) => x.id === id);
  if (!t || t.id === currentTier.id) return;
  currentTier = t;
  extractor = null;
  loading = null;
  setItem(CURRENT_TIER_KEY, id).catch(() => {});
  emitTier();
}

// 下载进度回调：真实字节累计。多文件依次下载，分母优先用 transformers 上报的
// 各文件真实 total 之和（无 content-length 时 Next dev 走 chunked 拿不到，退回档位估算体积）。
export interface EmbedDownloadProgress {
  loaded: number;   // 已下载字节（含已完成文件累加）
  total: number;    // 总字节（真实之和或档位估算）；>0 才有意义
}

// 已下载档位持久化（浏览器端用户本地目录）：权重本身落在浏览器 Cache Storage
// （即用户电脑/手机浏览器本地目录，真实文件存于浏览器 profile 的 Cache 下），
// 这里额外把「曾成功下载过的档位 id」集合持久化到 IndexedDB（与 modelStore 同库），
// 比 localStorage 更稳：刷新、重开浏览器、清 cookie 都不丢。
const DOWNLOADED_KEY = 'tf_embed_downloaded';
const CURRENT_TIER_KEY = 'tf_embed_current_tier';
let memoryDownloaded: string[] | null = null;

type TierListener = () => void;
const tierListeners = new Set<TierListener>();

export function subscribeTier(fn: TierListener): () => void {
  tierListeners.add(fn);
  return () => { tierListeners.delete(fn); };
}

function emitTier() {
  tierListeners.forEach((fn) => fn());
}

export function getCurrentTier(): string {
  return currentTier.id;
}

export async function initDownloadedTiers(): Promise<void> {
  if (typeof window === 'undefined') return;
  if (memoryDownloaded) return;
  try {
    const raw = await getItem<string>(DOWNLOADED_KEY);
    memoryDownloaded = raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    memoryDownloaded = [];
  }
  snapshotCache = [...(memoryDownloaded ?? [])];

  try {
    const tierId = await getItem<string>(CURRENT_TIER_KEY);
    if (tierId) {
      const t = EMBED_TIERS.find((x) => x.id === tierId);
      if (t) {
        currentTier = t;
        emitTier();
      }
    }
  } catch {
    // ignore
  }
}

// 稳定快照：useSyncExternalStore 要求 getSnapshot 在未变更时返回同一引用，
// 否则会触发「getSnapshot should be cached」无限循环告警。
let snapshotCache: string[] = [];

// 同步读取已下载集合（需先 initDownloadedTiers 或经一次读写后填充；否则为空数组）
export function getDownloadedTiers(): string[] {
  return snapshotCache;
}

// 模块级发布订阅：让多组件共享同一份「已下载集合」实时状态（单一数据源），
// 避免 settings 页与 ModelsSettings 各自维护副本导致互相不感知。
type DownloadedListener = () => void;
const downloadedListeners = new Set<DownloadedListener>();
export function subscribeDownloaded(fn: DownloadedListener): () => void {
  downloadedListeners.add(fn);
  return () => downloadedListeners.delete(fn);
}
function emitDownloaded() {
  snapshotCache = [...(memoryDownloaded ?? [])];
  downloadedListeners.forEach((fn) => fn());
}

async function saveDownloaded(ids: string[]) {
  memoryDownloaded = [...new Set(ids)];
  if (typeof window === 'undefined') return;
  try {
    await setItem(DOWNLOADED_KEY, JSON.stringify(memoryDownloaded));
  } catch {
    /* 忽略 */
  }
  emitDownloaded();
}

// 异步标记某档已下载
export async function markTierDownloaded(id: string): Promise<void> {
  await initDownloadedTiers();
  const ids = getDownloadedTiers();
  if (!ids.includes(id)) await saveDownloaded([...ids, id]);
}

// 当前正在进行的下载控制器（用于取消）：用 AbortController 真正中断下载流程。
let activeAbort: AbortController | null = null;
export function cancelEmbedDownload() {
  activeAbort?.abort();
}

// 构建一个指定档位的 extractor；signal 用于取消。
// 注意：transformers.js 3.x 的 pipeline 不消费 signal 中止底层网络下载，
// 因此用 Promise.race 让取消请求即时 reject，避免「取消后仍标记已下载 / 继续占用」；
// 已下载的权重仍会落浏览器缓存，下次下载可复用。
async function buildExtractor(
  onProgress?: (p: EmbedDownloadProgress) => void,
  signal?: AbortSignal,
  tier: EmbedModelTier = currentTier,
): Promise<FeatureExtractionPipeline> {
  // transformers.js v3 的 pipeline 返回类型联合过大，TS 无法表示（TS2590），
  // 用 any 取模块后再断言回 FeatureExtractionPipeline，运行时类型正确。
  const mod = await import('@huggingface/transformers');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { pipeline, env } = mod as any;
  // 浏览器端：权重走后端代理，规避浏览器直连 HuggingFace 被墙 / CORS。
  if (typeof window !== 'undefined') {
    env.allowLocalModels = false;
    env.remoteHost = MODEL_BASE_URL;
    if (env.backends?.onnx?.wasm) {
      env.backends.onnx.wasm.wasmPaths = '/ort-wasm/';
    }
  }

  const estTotal = tier.sizeMB * 1024 * 1024;
  const fileMap: Record<string, { loaded: number; total: number }> = {};
  const report = (onProgress: (p: EmbedDownloadProgress) => void) => {
    let loaded = 0;
    let total = 0;
    for (const k in fileMap) {
      loaded += fileMap[k].loaded;
      total += fileMap[k].total;
    }
    const denom = total > 0 ? total : estTotal;
    onProgress({ loaded, total: denom });
  };

  const pipePromise = pipeline('feature-extraction', tier.model, {
    progress_callback: onProgress
      ? (e: { status: string; progress?: number; loaded?: number; total?: number; file?: string }) => {
          const file = e.file ?? '?';
          if (e.status === 'progress') {
            const total = typeof e.total === 'number' && e.total > 0 ? e.total : (fileMap[file]?.total ?? 0);
            const loaded = typeof e.loaded === 'number' ? e.loaded : (fileMap[file]?.loaded ?? 0);
            fileMap[file] = { loaded, total };
          } else if (e.status === 'done') {
            const prev = fileMap[file] ?? { loaded: 0, total: 0 };
            const total = typeof e.total === 'number' && e.total > 0 ? e.total : (prev.total || estTotal);
            fileMap[file] = { loaded: total, total };
          } else if (e.status === 'initiate' || e.status === 'download') {
            if (!fileMap[file]) fileMap[file] = { loaded: 0, total: 0 };
          }
          report(onProgress);
        }
      : undefined,
    signal,
  });
  const abortPromise = new Promise<FeatureExtractionPipeline>((_, reject) => {
    if (!signal) return;
    if (signal.aborted) {
      reject(new DOMException('下载已取消', 'AbortError'));
      return;
    }
    signal.addEventListener(
      'abort',
      () => reject(new DOMException('下载已取消', 'AbortError')),
      { once: true },
    );
  });
  const pipe = await Promise.race([pipePromise, abortPromise]);
  if (onProgress) onProgress({ loaded: estTotal, total: estTotal });
  return pipe as FeatureExtractionPipeline;
}

// onProgress/signal/tier 仅用于显式下载；常规 embed() 调用不传（走 currentTier）。
async function getExtractor(
  onProgress?: (p: EmbedDownloadProgress) => void,
  signal?: AbortSignal,
  tier?: EmbedModelTier,
): Promise<FeatureExtractionPipeline> {
  if (extractor) return extractor;
  // 进行中则复用同一 promise（含正在下载的预热），避免并发重复构建 /
  // 复用已失败的 rejected promise。失败时 loading 已被清，下次调用会重启。
  if (loading) return loading;
  const target = tier ?? currentTier;
  const start = () =>
    buildExtractor(onProgress, signal, target)
      .then((p) => { extractor = p; loading = null; return p; })
      .catch((e) => { loading = null; throw e; });
  loading = start();
  return loading;
}

// 文本 -> 向量（维度随档位）。normalize 后可直接做余弦相似度。
export async function embed(text: string): Promise<number[]> {
  const pipe = await getExtractor();
  const out = await pipe(text, { pooling: 'mean', normalize: true });
  const data = Array.from(out.data as Float32Array);
  // A23：首次推理后校验维度，避免模型与档位维度不符导致静默截断/补零。
  // 维度不一致通常是下载了与当前档位不匹配的模型，给出可操作提示。
  if (data.length !== currentTier.dim) {
    throw new Error(
      `本地检索模型维度（${data.length}）与当前档位「${currentTier.label}」（${currentTier.dim} 维）不符，请在设置页重新下载对应档位模型`,
    );
  }
  return data;
}

// 显式下载指定档位模型：仅把权重拉到浏览器缓存（带进度回调），不切换 currentTier。
// 与旧预热逻辑共用 extractor 单例：若已就绪且档位一致直接标记返回，
// 否则清掉之前的加载锁重新下载，避免并发重复构建。
export async function downloadEmbedModel(id: string, onProgress?: (p: EmbedDownloadProgress) => void): Promise<boolean> {
  const t = EMBED_TIERS.find((x) => x.id === id);
  if (!t) throw new Error(`未知向量模型档位：${id}`);
  // 若该档已就绪且即当前档，直接标记并跳过重复下载
  if (extractor && currentTier.id === id) {
    await markTierDownloaded(id);
    return true;
  }
  // 下载与切档解耦：仅下载目标档位权重到浏览器缓存，不改变 currentTier，
  // 避免已索引的个人库被静默切到空库导致检索恒空。切档由知识库页下拉显式触发。
  extractor = null;
  loading = null;
  const abort = new AbortController();
  activeAbort = abort;
  try {
    await getExtractor(onProgress, abort.signal, t);
    // 下载成功：释放 extractor（权重已落缓存，下次按 currentTier 重建更快），
    // 仅标记该档已下载，不切换 currentTier。
    extractor = null;
    loading = null;
    await markTierDownloaded(id);
    return true;
  } catch (e) {
    // 取消（AbortError）不标记已下载、不视为失败提示；其余错误向上抛出由调用方提示。
    if (abort.signal.aborted) return false;
    throw e;
  } finally {
    if (activeAbort === abort) activeAbort = null;
  }
}

// 删除某个档位：清浏览器 Cache Storage 中该模型权重 + 从已下载集合移除。
// 不影响其它档位；若删除的是当前档，则清空内存 extractor。
export async function deleteEmbedModel(id: string): Promise<void> {
  const t = EMBED_TIERS.find((x) => x.id === id);
  if (!t) return;
  if (typeof window !== 'undefined' && 'caches' in window) {
    try {
      const cache = await caches.open('transformers-cache');
      const keys = await cache.keys();
      await Promise.all(
        keys
          .filter((req) => {
            const u = req.url;
            return u.includes(t.model);
          })
          .map((req) => cache.delete(req))
      );
    } catch {
      /* 忽略缓存删除失败 */
    }
  }
  await initDownloadedTiers();
  const ids = getDownloadedTiers();
  await saveDownloaded(ids.filter((x) => x !== id));
  if (currentTier.id === id) {
    extractor = null;
    loading = null;
  }
}

// 已下载集合的订阅工具见上方定义；此处不再保留旧预热函数。
