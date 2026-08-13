// 知识库 / RAG 检索层
// 个人库：端侧向量检索（本地 altor-vec + bge-zh），纯客户端
// 公共库：后端 pgvector POST /api/knowledge/search

import { apiClient } from '@/shared/api/client';
import { fetchModelConfig } from '@/shared/api/models';
import { type RagChunk, putKbDoc, getAllKbDocs, deleteKbDoc, type KbDocRecord } from '@/lib/storage/indexedDB';
import { vectorSearch, indexDocument, removeDocumentChunks } from '@/lib/rag/vectorStore';
import { downloadBlob } from '@/lib/utils/download';

export type KbScope = 'personal' | 'public';

// A24：计算文本 SHA-256 哈希（用于个人文档内容去重）。浏览器安全上下文可用 crypto.subtle。
async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

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

// 公共库检索只由后端 agent 的 search 工具（mode="docs"）发起，前端 UI 不调用此路径，
// 前端仅消费公共库的列表/下载/上传/删除（后端 /knowledge/search 为 agent 专用端点）。

export const ragClient = {
  // 仅个人库端侧检索；公共库检索由后端 agent 的 search 工具（mode="docs"）发起
  async search(
    q: string, limit = 4,
    filter?: { docIds?: string[]; authorIds?: string[]; sample?: string },
  ): Promise<RagChunk[]> {
    const query = filter?.sample ?? q;
    const hits = await vectorSearch(query, limit, filter ? { docIds: filter.docIds, authorIds: filter.authorIds } : undefined);
    return hits.map((h) => ({ docId: h.docId, docName: h.docName, text: h.text, score: h.score, uploaderName: h.uploaderName }));
  },

  async uploadPersonal(file: File, userId?: string, userName?: string): Promise<KbDocMeta> {
    // A24：体积预检（>20MB 直接拦截，避免大文件拖垮端侧 embedding / 索引）
    if (file.size > 20 * 1024 * 1024) {
      throw new Error('文件过大（超过 20MB），请拆分或压缩后上传');
    }
    const content = await file.text().catch(() => '');
    // A24：按内容 SHA-256 去重，同内容已上传则不重复入库
    const contentHash = content ? await sha256Hex(content) : '';
    if (contentHash) {
      const dup = (await getAllKbDocs()).find((d) => d.scope === 'personal' && d.contentHash === contentHash);
      if (dup) throw new Error('该文档内容已上传，未重复入库');
    }
    const id = `doc-${Date.now()}`;
    const rec: KbDocRecord = {
      id, name: file.name, status: 'indexing', createdAt: new Date().toISOString(),
      scope: 'personal', uploaderId: userId, uploaderName: userName, content, contentHash,
    };
    // 先落「索引中」，索引完成才置 indexed，失败置 failed 并上抛，
    // 避免索引失败仍显示已索引（检索空手用户无感知）。
    // 空/不可读内容（二进制、读取失败）indexDocument 会直接 return 不抛错，
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

  async removePersonal(id: string): Promise<void> {
    await deleteKbDoc(id);
    await removeDocumentChunks(id).catch(() => {});
  },

  // S12：支持分页（后端 /knowledge/public 接受 page/page_size，每页默认 100 条）。
  // A25：不再吞异常——失败抛出让调用方 showApiError（区分 401/网络）。
  async listPublic(page = 1, pageSize = 100): Promise<KbDocMeta[]> {
    const { data } = await apiClient.get<{ documents: KbDocMeta[] }>('/knowledge/public', {
      params: { page, page_size: pageSize },
    });
    if (Array.isArray(data.documents)) return data.documents as KbDocMeta[];
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

  // S14：后端返回 {status: "uploaded" | "existed", ...}，透出 status 供 UI 区分提示。
  async uploadPublic(file: File): Promise<{ status: string }> {
    const form = new FormData();
    form.append('file', file);
    // 携带 embedding 配置（model_config_json 表单字段）：后端 /knowledge/upload
    // 据此为 chunk 生成向量，缺省时落 _EmbeddingStub 写入空向量，
    // 文档将永远无法被后端 Agent 的公共库语义检索命中。
    const emb = (await fetchModelConfig().catch(() => null))?.embeddingModel;
    if (emb && emb.adapter && emb.model_id && emb.api_key) {
      form.append(
        'model_config_json',
        JSON.stringify({
          embedding_config: {
            adapter: emb.adapter,
            base_url: emb.base_url,
            api_key: emb.api_key,
            model_id: emb.model_id,
          },
        }),
      );
    }
    // 不显式设置 Content-Type：axios 对 FormData 自动生成带 boundary 的 multipart 头
    const { data } = await apiClient.post<{ status: string }>('/knowledge/upload', form);
    return { status: typeof data?.status === 'string' ? data.status : 'uploaded' };
  },

  async removePublic(id: string): Promise<void> {
    await apiClient.delete(`/knowledge/${id}`);
  },
};
