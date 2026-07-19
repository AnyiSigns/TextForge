// src/lib/rag/vectorStore.ts
//
// 个人库本地向量检索（端侧，不依赖后端）。
// - 用 altor-vec（wasm HNSW）做相似度检索，向量 + 元数据存 IndexedDB。
// - 文档上传时分块 -> bge-zh embedding -> 建索引；检索时按 query 向量取 Top-N 片段。
// - 索引序列化字节存 IndexedDB，离线/刷新后免重建。
//
// 数据模型：
//   KB_CHUNKS 表：{ id, docId, docName, uploaderName?, text, vec? }  文本 + 原始向量
//   KB_INDEX   键：单一序列化的 altor-vec 字节（全量索引）

import { openDB, type IDBPDatabase } from 'idb';
// 仅类型导入：避免 wasm 包在顶层初始化污染页面 hydration（改为运行时动态 import）。
import type { WasmSearchEngine } from 'altor-vec';
import { embed, getEmbedDim } from './embed';
import { EMBED_TIERS } from './embed';
import { chunkDocument } from './chunk';
import { getAllKbDocs, putKbDoc, type KbDocRecord } from '@/lib/storage/indexedDB';

// altor-vec 运行时模块句柄（动态加载，仅浏览器端首次检索时初始化）
type AltorVecModule = typeof import('altor-vec');
let altorVec: AltorVecModule | null = null;
async function loadAltorVec(): Promise<AltorVecModule> {
  if (!altorVec) {
    altorVec = await import('altor-vec');
    await altorVec.default();
  }
  return altorVec;
}

// 数据库名带维度后缀：切换向量维度档位时自动隔离，旧索引不混用、触发重建。
function dbName(): string {
  return `text-forge-rag-${getEmbedDim()}`;
}
const CHUNK_STORE = 'chunks';
const INDEX_KEY = 'personal-index';
const DB_VERSION = 1;

// altor-vec HNSW 参数
const M = 16;
const EF_CONSTRUCTION = 200;
const EF_SEARCH = 50;

let dbPromise: Promise<IDBPDatabase> | null = null;
function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(dbName(), DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(CHUNK_STORE)) {
          db.createObjectStore(CHUNK_STORE, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export interface StoredChunk {
  id: string;            // chunk 唯一 id: `${docId}#${idx}`
  docId: string;
  docName: string;
  uploaderName?: string;
  text: string;
  vec: number[];
}

let engine: WasmSearchEngine | null = null;
let engineLoading: Promise<WasmSearchEngine> | null = null;

async function getEngine(): Promise<WasmSearchEngine> {
  if (engine) return engine;
  if (!engineLoading) {
    engineLoading = (async () => {
      const mod = await loadAltorVec();
      const db = await getDB();
      const bytes = await db.get('keyval', INDEX_KEY);
      if (bytes instanceof Uint8Array && bytes.byteLength > 0) {
        return new mod.WasmSearchEngine(bytes);
      }
      // 无索引：用现有 chunks 重建
      const chunks = await loadAllChunks();
      return buildEngine(chunks);
    })();
  }
  engine = await engineLoading;
  return engine;
}

async function loadAllChunks(): Promise<StoredChunk[]> {
  const db = await getDB();
  return (await db.getAll(CHUNK_STORE)) as StoredChunk[];
}

async function buildEngine(chunks: StoredChunk[]): Promise<WasmSearchEngine> {
  const mod = await loadAltorVec();
  const dim = getEmbedDim();
  if (chunks.length === 0) {
    // 空索引：塞一个零向量占位，避免 from_vectors 报错
    const flat = new Float32Array(dim);
    return mod.WasmSearchEngine.from_vectors(flat, dim, M, EF_CONSTRUCTION, EF_SEARCH);
  }
  const flat = new Float32Array(chunks.length * dim);
  chunks.forEach((c, i) => {
    for (let j = 0; j < dim; j++) flat[i * dim + j] = c.vec[j] ?? 0;
  });
  return mod.WasmSearchEngine.from_vectors(flat, dim, M, EF_CONSTRUCTION, EF_SEARCH);
}

async function persistEngine(eng: WasmSearchEngine): Promise<void> {
  const bytes = eng.to_bytes();
  const db = await getDB();
  await db.put('keyval', bytes, INDEX_KEY);
}

// 把一篇文档分块 + embedding + 存库 + 重建索引
export async function indexDocument(doc: KbDocRecord): Promise<void> {
  if (!doc.content) return;
  const texts = chunkDocument(doc.content);
  const chunks: StoredChunk[] = await Promise.all(
    texts.map(async (text, idx) => ({
      id: `${doc.id}#${idx}`,
      docId: doc.id,
      docName: doc.name,
      uploaderName: doc.uploaderName,
      text,
      vec: await embed(text),
    })),
  );

  const db = await getDB();
  const tx = db.transaction(CHUNK_STORE, 'readwrite');
  // 先删旧 chunk（同 docId）
  const all = (await db.getAll(CHUNK_STORE)) as StoredChunk[];
  for (const c of all) if (c.docId === doc.id) await tx.store.delete(c.id);
  for (const c of chunks) await tx.store.put(c);
  await tx.done;

  // 重建并持久化索引
  const eng = await buildEngine(await loadAllChunks());
  engine = eng;
  await persistEngine(eng);
}

export async function removeDocumentChunks(docId: string): Promise<void> {
  const db = await getDB();
  const all = (await db.getAll(CHUNK_STORE)) as StoredChunk[];
  const tx = db.transaction(CHUNK_STORE, 'readwrite');
  for (const c of all) if (c.docId === docId) await tx.store.delete(c.id);
  await tx.done;
  const eng = await buildEngine(all.filter((c) => c.docId !== docId));
  engine = eng;
  await persistEngine(eng);
}

export async function reindexAll(): Promise<void> {
  const docs = await getAllKbDocs();
  for (const d of docs) {
    await indexDocument(d).catch(() => {});
    // 重建完成，文档恢复「已索引」状态（避免一直显示待重建）
    if (d.status !== 'indexed') await putKbDoc({ ...d, status: 'indexed' });
  }
}

export interface VectorSearchHit {
  id: string;
  docId: string;
  docName: string;
  uploaderName?: string;
  text: string;
  score: number; // 相似度（由 distance 转换，越大越相似）
}

// 本地向量检索。filter 可按 文档id / 作者 限定范围。
export async function vectorSearch(
  query: string,
  topK = 4,
  filter?: { docIds?: string[]; authorIds?: string[] },
): Promise<VectorSearchHit[]> {
  const qVec = await embed(query);
  const eng = await getEngine();
  const raw = JSON.parse(eng.search(new Float32Array(qVec), topK * 4)) as [string, number][];

  const db = await getDB();
  const chunks = (await db.getAll(CHUNK_STORE)) as StoredChunk[];
  const byId = new Map(chunks.map((c) => [c.id, c]));

  const hits: VectorSearchHit[] = [];
  for (const [id, dist] of raw) {
    const c = byId.get(id);
    if (!c) continue;
    if (filter?.docIds?.length && !filter.docIds.includes(c.docId)) continue;
    if (filter?.authorIds?.length && !filter.authorIds.includes(c.uploaderName ?? '')) continue;
    hits.push({
      id: c.id,
      docId: c.docId,
      docName: c.docName,
      uploaderName: c.uploaderName,
      text: c.text,
      score: 1 / (1 + dist), // distance -> 相似度
    });
  }
  return hits.slice(0, topK);
}

export async function chunkCount(): Promise<number> {
  const db = await getDB();
  return (await db.getAll(CHUNK_STORE)).length;
}

// 切换向量维度档位时，把所有个人文档标记为「待重建」并清空全部维度的向量分块库，
// 避免不同维度向量混用导致检索结果错乱（旧文档在新维度库里检索不到却仍显示「已索引」）。
// 返回需重建的文档数，调用方据此提示用户重新建库。
export async function resetForTier(tierId: string): Promise<number> {
  const { setEmbedTier } = await import('./embed');
  const t = EMBED_TIERS.find((x) => x.id === tierId);
  if (!t) return 0;
  if (t.dim === getEmbedDim()) return 0; // 未变化

  // 清空所有维度档位各自的向量分块库（库名带维度后缀，直接删除整库最稳妥）
  await Promise.all(
    EMBED_TIERS.map(
      (tier) =>
        new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase(`text-forge-rag-${tier.dim}`);
          req.onsuccess = req.onerror = req.onblocked = () => resolve();
        })
    )
  );
  engine = null;

  // 文档元数据标记待重建（列表仍保留，但状态变为「需重建」，检索时不会被误判为可用）
  const docs = await getAllKbDocs();
  const personal = docs.filter((d) => d.scope === 'personal');
  await Promise.all(
    personal.map((d) => putKbDoc({ ...d, status: 'indexing' }))
  );

  setEmbedTier(tierId);
  return personal.length;
}
