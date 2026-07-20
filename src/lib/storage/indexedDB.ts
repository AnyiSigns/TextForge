import { openDB, type IDBPDatabase } from 'idb';
import type { ProjectBrief, Step, ManuscriptChapter } from '@/types';

const DB_NAME = 'text-forge-db';
const STORE_NAME = 'keyval';
const KB_STORE = 'knowledge';   // 个人文档库（端侧向量检索的本地载体）
const MS_STORE = 'manuscript';  // 作家手稿章节（独立于工作台 steps）
const DB_VERSION = 4;

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
        if (!db.objectStoreNames.contains(KB_STORE)) {
          db.createObjectStore(KB_STORE, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(MS_STORE)) {
          db.createObjectStore(MS_STORE, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function getItem<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  const value = await db.get(STORE_NAME, key);
  return value as T | undefined;
}

export async function setItem<T>(key: string, value: T): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, value, key);
}

export async function removeItem(key: string): Promise<void> {
  const db = await getDB();
  await db.delete(STORE_NAME, key);
}

export async function clearAll(): Promise<void> {
  const db = await getDB();
  await db.clear(STORE_NAME);
}

export interface ProjectVersion {
  id: string;
  projectId: string;
  steps: Step[];
  brief?: { genre?: string; worldview?: string; tone?: string; forbidden?: string; styleGuide?: string; wordCountGoal?: number; dailyWordCountGoal?: number; defaultVisionModel?: string; defaultStyle?: string };
  createdAt: string;
  wordCount: number;
}

const DRAFT_KEY = 'project-draft';
const HISTORY_KEY = 'project-history';

export async function saveDraft(projectId: string, steps: Step[]): Promise<void> {
  const draft = {
    projectId,
    steps,
    savedAt: new Date().toISOString(),
  };
  await setItem(`${DRAFT_KEY}-${projectId}`, draft);
}

export async function getDraft(projectId: string): Promise<{ steps: Step[] } | undefined> {
  return await getItem(`${DRAFT_KEY}-${projectId}`);
}

export async function clearDraft(projectId: string): Promise<void> {
  await removeItem(`${DRAFT_KEY}-${projectId}`);
}

export async function saveVersion(projectId: string, version: ProjectVersion): Promise<void> {
  const history = await getItem<ProjectVersion[]>(`${HISTORY_KEY}-${projectId}`) || [];
  const updated = [version, ...history.filter(v => v.id !== version.id)].slice(0, 20);
  await setItem(`${HISTORY_KEY}-${projectId}`, updated);
}

export async function getVersionHistory(projectId: string): Promise<ProjectVersion[]> {
  return await getItem<ProjectVersion[]>(`${HISTORY_KEY}-${projectId}`) || [];
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  genre?: string;
  defaultBrief?: Partial<ProjectBrief>;
  createdAt: string;
}

// ---------------- 知识库（个人文档库端侧载体） ----------------
// 个人库：文档内容存浏览器 IndexedDB（KB_STORE），向量检索在本地用 altor-vec 完成，
// 不依赖后端。公共库：检索走后端 /api/knowledge/search?scope=public，前端不存正文。
export interface KbDocRecord {
  id: string;
  name: string;
  status: 'indexing' | 'indexed' | 'failed';
  createdAt: string;
  scope: 'personal' | 'public';
  uploaderId?: string;
  uploaderName?: string;
  content?: string;   // 仅个人库 mock 期存储；公共库不存正文
}

export async function putKbDoc(doc: KbDocRecord): Promise<void> {
  const db = await getDB();
  await db.put(KB_STORE, doc);
}

export async function getKbDoc(id: string): Promise<KbDocRecord | undefined> {
  const db = await getDB();
  return (await db.get(KB_STORE, id)) as KbDocRecord | undefined;
}

export async function getAllKbDocs(): Promise<KbDocRecord[]> {
  const db = await getDB();
  return (await db.getAll(KB_STORE)) as KbDocRecord[];
}

export async function deleteKbDoc(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(KB_STORE, id);
}

// 极简本地关键词检索（兼容旧调用）：按词频对相关文档片段打分，返回 Top-N 片段。
// 新检索走 src/lib/rag/vectorStore.ts 的端侧向量检索。
export interface RagChunk {
  docId: string;
  docName: string;
  text: string;
  score: number;
}

export async function localRagSearch(query: string, scope: 'personal' | 'public', limit = 3): Promise<RagChunk[]> {
  const docs = (await getAllKbDocs()).filter((d) => d.scope === scope && d.content);
  const q = query.toLowerCase().split(/\s+/).filter(Boolean);
  const chunks: RagChunk[] = [];
  for (const doc of docs) {
    const paras = doc.content!.split(/\n{2,}|\n/).map((s) => s.trim()).filter((s) => s.length > 10);
    for (const p of paras) {
      const lower = p.toLowerCase();
      const hit = q.reduce((acc, w) => acc + (lower.includes(w) ? 1 : 0), 0);
      if (hit > 0) chunks.push({ docId: doc.id, docName: doc.name, text: p, score: hit });
    }
  }
  return chunks.sort((a, b) => b.score - a.score).slice(0, limit);
}

// ---------------- 作家手稿章节 ----------------
export async function putManuscriptChapter(ch: ManuscriptChapter): Promise<void> {
  const db = await getDB();
  await db.put(MS_STORE, ch);
}

export async function getManuscriptChapters(projectId: string): Promise<ManuscriptChapter[]> {
  const db = await getDB();
  const all = (await db.getAll(MS_STORE)) as ManuscriptChapter[];
  return all
    .filter((c) => c.projectId === projectId)
    .sort((a, b) => a.index - b.index || a.updatedAt.localeCompare(b.updatedAt));
}

export async function deleteManuscriptChapter(id: string): Promise<void> {
  const db = await getDB();
  await db.delete(MS_STORE, id);
}

export async function deleteManuscriptByProject(projectId: string): Promise<void> {
  const db = await getDB();
  const all = (await db.getAll(MS_STORE)) as ManuscriptChapter[];
  await Promise.all(all.filter((c) => c.projectId === projectId).map((c) => db.delete(MS_STORE, c.id)));
}
