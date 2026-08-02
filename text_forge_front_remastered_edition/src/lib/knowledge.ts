// 知识库 / RAG 检索层
// 个人库：端侧向量检索（本地 altor-vec + bge-zh）
// 公共库：后端 pgvector GET /api/knowledge/search?scope=public&q=

import { apiClient } from '@/shared/api/client';
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
  const { data } = await apiClient.get<{ chunks: RagChunk[] }>(
    `/knowledge/search?scope=public&q=${encodeURIComponent(q)}`,
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
    const form = new FormData();
    form.append('file', file);
    form.append('doc_id', id);
    apiClient.post('/knowledge/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).catch(() => {});
    return rec;
  },

  async listPersonal(): Promise<KbDocMeta[]> {
    try {
      const { data } = await apiClient.get<{ documents: KbDocMeta[] }>('/knowledge');
      if (Array.isArray(data.documents)) return data.documents as KbDocMeta[];
    } catch { /* fallback to local */ }
    return (await getAllKbDocs()).filter((d) => d.scope === 'personal');
  },

  async getPersonalContent(id: string): Promise<string | undefined> {
    const rec = await getKbDoc(id);
    return rec?.content;
  },

  async removePersonal(id: string): Promise<void> {
    await deleteKbDoc(id);
    await removeDocumentChunks(id).catch(() => {});
    try { await apiClient.delete(`/knowledge/${id}`); } catch { /* already local-deleted */ }
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
    const res = await fetch(`/api/knowledge/public/${id}/download`, { credentials: 'include' });
    if (res.ok) { const blob = await res.blob(); downloadBlob(blob, name); return; }
    throw new Error('下载失败');
  },
};
