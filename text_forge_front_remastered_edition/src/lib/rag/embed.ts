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

export function isTierDownloaded(id: string): boolean {
  return memoryDownloaded ? memoryDownloaded.includes(id) : false;
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

// 当前正在进行的下载控制器（用于取消）
let activeController: { cancelled: boolean } | null = null;
export function cancelEmbedDownload() {
  if (activeController) activeController.cancelled = true;
}

async function buildExtractor(onProgress?: (p: EmbedDownloadProgress) => void, controller?: { cancelled: boolean }): Promise<FeatureExtractionPipeline> {
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

  const estTotal = currentTier.sizeMB * 1024 * 1024;
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

  const pipe = await pipeline('feature-extraction', currentTier.model, {
    progress_callback: onProgress
      ? (e: { status: string; progress?: number; loaded?: number; total?: number; file?: string }) => {
          if (controller?.cancelled) return;
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
  });
  if (onProgress) onProgress({ loaded: estTotal, total: estTotal });
  return pipe as FeatureExtractionPipeline;
}

async function getExtractor(onProgress?: (p: EmbedDownloadProgress) => void, controller?: { cancelled: boolean }): Promise<FeatureExtractionPipeline> {
  if (extractor) return extractor;
  // 进行中则复用同一 promise（含正在下载的预热），避免并发重复构建 /
  // 复用已失败的 rejected promise。失败时 loading 已被清，下次调用会重启。
  if (loading) return loading;
  const start = () =>
    buildExtractor(onProgress, controller)
      .then((p) => { extractor = p; loading = null; return p; })
      .catch((e) => { loading = null; throw e; });
  loading = start();
  return loading;
}

// 文本 -> 向量（维度随档位）。normalize 后可直接做余弦相似度。
export async function embed(text: string): Promise<number[]> {
  const pipe = await getExtractor();
  const out = await pipe(text, { pooling: 'mean', normalize: true });
  return Array.from(out.data as Float32Array).slice(0, currentTier.dim);
}

// 显式下载指定档位模型：切到该档、并发起下载（带进度回调）。
// 与 prewarmEmbed 共用 extractor 单例：若已就绪且档位一致直接返回，
// 否则强制清掉之前的加载锁重新下载，避免被静默预热的 loading 阻塞。
export async function downloadEmbedModel(id: string, onProgress?: (p: EmbedDownloadProgress) => void): Promise<boolean> {
  const t = EMBED_TIERS.find((x) => x.id === id);
  if (!t) throw new Error(`未知向量模型档位：${id}`);
  // 切换档位：若当前已是该档且已就绪，直接返回（无需重复下载）
  if (extractor && currentTier.id === id) {
    await markTierDownloaded(id);
    return true;
  }
  setEmbedTier(id);
  extractor = null;
  loading = null;
  const controller = { cancelled: false };
  activeController = controller;
  try {
    await getExtractor(onProgress, controller);
    // 下载成功：记录该档已下载（即便中途被新下载取代，本档权重已落本地缓存）
    await markTierDownloaded(id);
    return true;
  } finally {
    if (activeController === controller) activeController = null;
  }
}

// 仅切换当前精度档（不触发下载），用于已下载档位的即时切换。
export function switchEmbedTier(id: string) {
  const t = EMBED_TIERS.find((x) => x.id === id);
  if (!t) return;
  if (extractor && currentTier.id !== id) {
    extractor = null;
    loading = null;
  }
  currentTier = t;
  setItem(CURRENT_TIER_KEY, id).catch(() => {});
  emitTier();
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
