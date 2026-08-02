// IndexedDB 存储：keyval + 个人知识库文档载体
import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'text-forge-db';
const STORE_NAME = 'keyval';
const KB_STORE = 'knowledge';
const DB_VERSION = 2;

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
