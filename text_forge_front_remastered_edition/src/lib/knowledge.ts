// 知识库 / RAG 检索层
// 个人库：端侧向量检索（本地 altor-vec + bge-zh），纯客户端
// 公共库：后端 pgvector POST /api/knowledge/search

import { apiClient } from '@/shared/api/client';
import { authFetch } from '@/shared/lib/authFetch';
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
  content?: string;
}

async function backendPublicSearch(q: string): Promise<RagChunk[]> {
  const { data } = await apiClient.post<{ chunks: RagChunk[] }>(
    '/knowledge/search',
    { query: q, scope: 'public', top_k: 3 },
  );
  return data.chunks ?? [];
}

export const ragClient = {
  async search(
    q: string, scope: KbScope = 'personal', limit = 4,
    filter?: { docIds?: string[]; authorIds?: string[]; sample?: string },
  ): Promise<RagChunk[]> {
    if (scope === 'public') return backendPublicSearch(q);
    const query = filter?.sample ?? q;
    const hits = await vectorSearch(query, limit, filter ? { docIds: filter.docIds, authorIds: filter.authorIds } : undefined);
    return hits.map((h) => ({ docId: h.docId, docName: h.docName, text: h.text, score: h.score, uploaderName: h.uploaderName }));
  },

  async uploadPersonal(file: File, userId?: string, userName?: string): Promise<KbDocMeta> {
    const id = `doc-${Date.now()}`;
    const content = await file.text().catch(() => '');
    const rec: KbDocRecord = {
      id, name: file.name, status: 'indexed', createdAt: new Date().toISOString(),
      scope: 'personal', uploaderId: userId, uploaderName: userName, content,
    };
    await putKbDoc(rec);
    indexDocument(rec).catch(() => {});
    return rec;
  },

  async listPersonal(): Promise<KbDocMeta[]> {
    return (await getAllKbDocs()).filter((d) => d.scope === 'personal');
  },

  async getPersonalContent(id: string): Promise<string | undefined> {
    const rec = await getKbDoc(id);
    return rec?.content;
  },

  async removePersonal(id: string): Promise<void> {
    await deleteKbDoc(id);
    await removeDocumentChunks(id).catch(() => {});
  },

  async listPublic(): Promise<KbDocMeta[]> {
    try {
      const { data } = await apiClient.get<{ documents: KbDocMeta[] }>('/knowledge/public');
      if (Array.isArray(data.documents)) return data.documents as KbDocMeta[];
    } catch { /* not ready */ }
    return [];
  },

  async getPublicContent(id: string): Promise<string | null> {
    try {
      const { data } = await apiClient.get<{ content: string }>(`/knowledge/public/${id}`);
      if (typeof data.content === 'string') return data.content;
    } catch { /* fall through */ }
    return null;
  },

  async downloadPublic(id: string, name: string): Promise<void> {
    const res = await authFetch(`/api/knowledge/public/${id}`);
    if (!res.ok) throw new Error('获取文档详情失败');
    const data = await res.json().catch(() => ({}));
    const content = typeof data?.content === 'string' ? data.content : undefined;
    if (!content) throw new Error('文档内容为空');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    downloadBlob(blob, name);
  },

  async uploadPublic(file: File): Promise<void> {
    const form = new FormData();
    form.append('file', file);
    await apiClient.post('/knowledge/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },

  async removePublic(id: string): Promise<void> {
    await apiClient.delete(`/knowledge/${id}`);
  },
};
