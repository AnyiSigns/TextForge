// src/types/knowledge.ts
// 个人文档库检索相关类型。

// 个人文档库检索命中片段（端侧向量检索结果）
export interface RagChunk {
  docId: string;     // 来源文档 id（某本书）
  docName: string;   // 书名 / 文档名
  text: string;      // 检索到的文本片段
  score: number;     // 相似度（越大越相关）
  uploaderName?: string; // 作者
}

// 检索范围限定（三种模式可组合）
// - 不传 filter：自动搜（按节点书写内容语义匹配整库）
// - sample：给样本搜（用户贴文本当 query）
// - docIds / authorIds：限定范围（可多项）
export interface RagFilter {
  docIds?: string[];
  authorIds?: string[];
  sample?: string;
}

export type RagScope = 'personal' | 'public' | 'both';
