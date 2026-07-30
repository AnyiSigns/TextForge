// src/lib/knowledge.ts
//
// 知识库 / RAG 检索层（前端统一入口）。
//
// 架构约定（前后端契约）：
// - 个人库：端侧向量检索（浏览器本地 altor-vec + bge-zh），文档与向量都存本机，
//   检索完全在本地完成、不依赖后端；仅命中片段随生成请求发后端。
// - 公共库：服务端 pgvector 检索，GET /api/knowledge/search?scope=public&q=
//   文档内容查看/下载：GET /api/knowledge/public/:id  /  GET /api/knowledge/public/:id/download
//
// 浏览器(web)工具与 RAG 一样属于"agent 的工具能力"：前端只声明节点 toolIds，
// 真实执行（抓网页/向量检索）在后端 tool 完成，由 agent 自主决定是否调用。

import { API_URL } from '@/lib/config/env';
import { useAuthStore } from '@/lib/stores/authStore';
import { type RagChunk, putKbDoc, getKbDoc, getAllKbDocs, deleteKbDoc, type KbDocRecord } from '@/lib/storage/indexedDB';
import { vectorSearch, indexDocument, removeDocumentChunks } from '@/lib/rag/vectorStore';
import { downloadBlob } from '@/lib/utils/download';

export type KbScope = 'personal' | 'public';

export interface KbDocMeta {
  id: string;
  name: string;
  status: 'indexing' | 'indexed' | 'failed';
  createdAt: string;
  scope: KbScope;
  uploaderId?: string;
  uploaderName?: string;
  content?: string; // 仅个人库本地存储时携带，用于预览；公共库不返回正文
}

// 公共库后端搜索（失败直接抛错，不再回退演示语料）
async function backendPublicSearch(q: string): Promise<RagChunk[]> {
  const token = useAuthStore.getState().accessToken;
  const res = await fetch(`${API_URL}/api/knowledge/search?scope=public&q=${encodeURIComponent(q)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`公共库检索失败：${res.status}`);
  const data = await res.json();
  return (data.chunks as RagChunk[]) ?? [];
}

// ---------- 统一 RAG 客户端 ----------

export const ragClient = {
  // 检索：
  // - personal：端侧向量检索（本地，不依赖后端）
  // - public：后端 pgvector，失败回退演示语料
  // filter 仅对个人库生效：限定文档/作者范围；sample 覆盖自动 query。
  async search(
    q: string,
    scope: KbScope = 'personal',
    limit = 4,
    filter?: { docIds?: string[]; authorIds?: string[]; sample?: string },
  ): Promise<RagChunk[]> {
    if (scope === 'public') {
      return backendPublicSearch(q);
    }
    // 个人库：本地向量检索
    const query = filter?.sample ?? q;
    const hits = await vectorSearch(query, limit, filter ? { docIds: filter.docIds, authorIds: filter.authorIds } : undefined);
    return hits.map((h) => ({ docId: h.docId, docName: h.docName, text: h.text, score: h.score, uploaderName: h.uploaderName }));
  },

  // 个人文档：上传（内容存本地 + 本地建向量索引）
  async uploadPersonal(file: File, userId?: string, userName?: string): Promise<KbDocMeta> {
    const id = `doc-${Date.now()}`;
    const content = await file.text().catch(() => '');
    const rec: KbDocRecord = {
      id, name: file.name, status: 'indexed', createdAt: new Date().toISOString(),
      scope: 'personal', uploaderId: userId, uploaderName: userName, content,
    };
    await putKbDoc(rec);
    indexDocument(rec).catch(() => {});
    const token = useAuthStore.getState().accessToken;
    await fetch(`${API_URL}/api/knowledge/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: file,
    });
    return rec;
  },

  async listPersonal(): Promise<KbDocMeta[]> {
    const token = useAuthStore.getState().accessToken;
    const res = await fetch(`${API_URL}/api/knowledge`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.documents)) {
        return data.documents as KbDocMeta[];
      }
    }
    return (await getAllKbDocs()).filter((d) => d.scope === 'personal');
  },

  async getPersonalContent(id: string): Promise<string | undefined> {
    const rec = await getKbDoc(id);
    return rec?.content;
  },

  async removePersonal(id: string): Promise<void> {
    await deleteKbDoc(id);
    await removeDocumentChunks(id).catch(() => {});
    try {
      const token = useAuthStore.getState().accessToken;
      await fetch(`${API_URL}/api/knowledge/${id}`, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} });
    } catch { /* 已本地删 */ }
  },

  // 公共库：列表（后端优先，不再回退演示）
  async listPublic(): Promise<KbDocMeta[]> {
    const res = await fetch(`${API_URL}/api/knowledge/public`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.documents)) {
        return data.documents as KbDocMeta[];
      }
    }
    return [];
  },

  // 公共库文档内容（查看/下载）：后端契约
  async getPublicContent(id: string): Promise<string | null> {
    const res = await fetch(`${API_URL}/api/knowledge/public/${id}`);
    if (res.ok) {
      const data = await res.json();
      if (typeof data.content === 'string') return data.content;
    }
    return null;
  },

  async downloadPublic(id: string, name: string): Promise<void> {
    const res = await fetch(`${API_URL}/api/knowledge/public/${id}/download`);
    if (res.ok) {
      const blob = await res.blob();
      downloadBlob(blob, name);
      return;
    }
    throw new Error('下载失败');
  },
};
