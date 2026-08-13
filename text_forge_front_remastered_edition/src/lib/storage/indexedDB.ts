// IndexedDB 存储：keyval + 个人知识库文档载体
import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'text-forge-db';
const STORE_NAME = 'keyval';
const KB_STORE = 'knowledge';

let dbPromise: Promise<IDBPDatabase> | null = null;

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    // 不锁定版本号：库可能被历史版本升级到更高版本，
    // openDB(name, 固定版本) 在版本低于现有库时会抛 VersionError 导致全部读写失败。
    // 不指定版本则打开当前版本；库不存在时 version=1 并执行 upgrade 建 store。
    dbPromise = openDB(DB_NAME, undefined, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
        if (!db.objectStoreNames.contains(KB_STORE)) {
          db.createObjectStore(KB_STORE, { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

export async function getItem<T>(key: string): Promise<T | undefined> {
  const db = await getDB();
  return (await db.get(STORE_NAME, key)) as T | undefined;
}

export async function setItem<T>(key: string, value: T): Promise<void> {
  const db = await getDB();
  await db.put(STORE_NAME, value, key);
}

// ── 知识库文档 ──

export interface KbDocRecord {
  id: string;
  name: string;
  status: 'indexing' | 'indexed' | 'failed';
  createdAt: string;
  scope: 'personal' | 'public';
  uploaderId?: string;
  uploaderName?: string;
  content?: string;
  /** 内容 SHA-256 哈希，用于个人文档去重（A24） */
  contentHash?: string;
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

export interface RagChunk {
  docId: string;
  docName: string;
  text: string;
  score: number;
  uploaderName?: string;
}
