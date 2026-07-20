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

// 公共库演示语料（后端就绪后由 /api/knowledge/public 返回真实数据）
const PUBLIC_DEMO: { id: string; name: string; content: string }[] = [
  {
    id: 'pub-1',
    name: '古典诗词格律参考.md',
    content:
      '平仄是古典诗词的声调规则。五言绝句常用仄起或平起首句不入韵式。\n押韵须依《平水韵》或新韵，一韵到底，不可换韵。\n对仗要求上下句词性相对、结构相同，常见于颔联与颈联。',
  },
  {
    id: 'pub-2',
    name: '世界神话体系综述.md',
    content:
      '创世神话多含"混沌—分离—秩序"三阶段，如北欧尤克特拉希尔连接九界。\n英雄旅程原型：启程、启蒙、回归，见于各民族史诗。\n神祇体系常按职能分化：天空、海洋、冥界、丰收，彼此制衡。',
  },
];

// ---------- 后端契约调用（仅公共库走后端） ----------

async function backendPublicSearch(q: string): Promise<RagChunk[] | null> {
  try {
    const token = useAuthStore.getState().accessToken;
    const res = await fetch(`${API_URL}/api/knowledge/search?scope=public&q=${encodeURIComponent(q)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.chunks as RagChunk[]) ?? null;
  } catch {
    return null;
  }
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
      const remote = await backendPublicSearch(q);
      if (remote) return remote;
      const docs = PUBLIC_DEMO;
      const ql = q.toLowerCase();
      const chunks: RagChunk[] = [];
      for (const d of docs) {
        for (const p of d.content.split(/\n+/).map((s) => s.trim()).filter(Boolean)) {
          const hit = ql.split(/\s+/).filter(Boolean).reduce((a, w) => a + (p.toLowerCase().includes(w) ? 1 : 0), 0);
          if (hit > 0) chunks.push({ docId: d.id, docName: d.name, text: p, score: hit });
        }
      }
      return chunks.sort((a, b) => b.score - a.score).slice(0, limit);
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
    // 本地建向量索引（异步，不阻塞上传返回）
    indexDocument(rec).catch(() => {});
    try {
      const token = useAuthStore.getState().accessToken;
      // 注意：multipart/form-data 不能手动设置 Content-Type——浏览器需自动生成
      // 带 boundary 的边界串，手动设置会丢失 boundary 导致后端 400。
      await fetch(`${API_URL}/api/knowledge/upload`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: file,
      });
    } catch { /* 后端未就绪，本地已存并建索引 */ }
    return rec;
  },

  async listPersonal(): Promise<KbDocMeta[]> {
    try {
      const token = useAuthStore.getState().accessToken;
      const res = await fetch(`${API_URL}/api/knowledge`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (res.ok) {
        const data = await res.json();
        if (!data?.mocked && Array.isArray(data.documents) && data.documents.length) {
          return data.documents as KbDocMeta[];
        }
      }
    } catch { /* 回退本地 */ }
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

  // 公共库：列表（后端优先，回退演示）
  async listPublic(): Promise<KbDocMeta[]> {
    try {
      const res = await fetch(`${API_URL}/api/knowledge/public`);
      if (res.ok) {
        const data = await res.json();
        if (!data?.mocked && Array.isArray(data.documents) && data.documents.length) {
          return data.documents as KbDocMeta[];
        }
      }
    } catch { /* 回退演示 */ }
    const me = useAuthStore.getState().user;
    return PUBLIC_DEMO.map((d, i) => ({
      id: d.id,
      name: d.name,
      status: 'indexed' as const,
      createdAt: '',
      scope: 'public' as const,
      uploaderId: i === 1 ? me?.id : `demo-author-${i}`,
      uploaderName: i === 1 ? me?.username ?? '我' : `示例作者${i}`,
    }));
  },

  // 公共库文档内容（查看/下载）：后端契约，回退演示语料
  async getPublicContent(id: string): Promise<string | null> {
    try {
      const res = await fetch(`${API_URL}/api/knowledge/public/${id}`);
      if (res.ok) {
        const data = await res.json();
        if (typeof data.content === 'string') return data.content;
      }
    } catch { /* 回退演示 */ }
    return PUBLIC_DEMO.find((d) => d.id === id)?.content ?? null;
  },

  async downloadPublic(id: string, name: string): Promise<void> {
    try {
      const res = await fetch(`${API_URL}/api/knowledge/public/${id}/download`);
      if (res.ok) {
        const blob = await res.blob();
        downloadBlob(blob, name);
        return;
      }
    } catch { /* 回退本地演示语料 */ }
    const content = PUBLIC_DEMO.find((d) => d.id === id)?.content ?? '';
    downloadBlob(new Blob([content], { type: 'text/markdown' }), name);
  },
};
