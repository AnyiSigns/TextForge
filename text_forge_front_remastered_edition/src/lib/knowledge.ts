// 知识库 / RAG 检索层
// 个人库：端侧向量检索（本地 altor-vec + bge-zh），纯客户端
// 公共库：后端 pgvector POST /api/knowledge/search

import { apiClient } from '@/shared/api/client';
import { type RagChunk, putKbDoc, getKbDoc, getAllKbDocs, deleteKbDoc, type KbDocRecord } from '@/lib/storage/indexedDB';
import { vectorSearch, indexDocument, removeDocumentChunks } from '@/lib/rag/vectorStore';
import { downloadBlob } from '@/lib/utils/download';

export type KbScope = 'personal' | 'public';

export interface KbDocMeta {
  id: string;
  name: string;
  /** 仅个人库返回索引状态；公共库列表（/knowledge/public）不携带该字段 */
  status?: 'indexing' | 'indexed' | 'failed';
  createdAt: string;
  scope: KbScope;
  uploaderId?: string;
  uploaderName?: string;
  content?: string;
}

// 公共库检索只由后端 agent 的 search 工具（mode="docs"）发起，前端 UI 不调用此路径。
// 勿在前端接线：后端 /knowledge/search 依赖 model_config_data 生成 embedding，
// 缺省会 400「需要 embedding 模型」；此分支仅保留为 ragClient.search(scope='public') 契约占位。
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
      id, name: file.name, status: 'indexing', createdAt: new Date().toISOString(),
      scope: 'personal', uploaderId: userId, uploaderName: userName, content,
    };
    // 任务 20：先落「索引中」，索引完成才置 indexed，失败置 failed 并上抛，
    // 避免索引失败仍显示已索引（检索空手用户无感知）。
    // 空/不可读内容（二进制、PDF、读取失败）indexDocument 会直接 return 不抛错，
    // 必须在此显式判失败，否则 0 chunk 仍显示「已索引」。
    if (!content.trim()) {
      await putKbDoc({ ...rec, status: 'failed' }).catch(() => {});
      throw new Error('个人文档内容为空或无法读取，仅支持可解析为文本的文件（txt/md 等）');
    }
    await putKbDoc(rec);
    try {
      await indexDocument(rec);
    } catch (e) {
      await putKbDoc({ ...rec, status: 'failed' }).catch(() => {});
      throw new Error(`个人文档索引失败：${(e as Error)?.message || '未知错误'}，请在设置页检查本地检索模型配置`);
    }
    await putKbDoc({ ...rec, status: 'indexed' });
    return { ...rec, status: 'indexed' };
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
    const { data } = await apiClient.get<{ content: string }>(`/knowledge/public/${id}`);
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
