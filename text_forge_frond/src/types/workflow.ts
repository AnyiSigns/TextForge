// src/types/workflow.ts
// 工作流步骤与生成上下文注入类型。
import type { RagChunk } from './knowledge';

export interface Step {
  id: string;
  agent: string;
  /** 展示名（中文节点名），优先于 agent 英文 nodeId 解析 */
  agentName?: string;
  content: string;
  status: 'pending' | 'streaming' | 'waiting' | 'completed' | 'failed';
  /** 关联的工作流节点 id（由 workflowToSteps 生成，便于"运行写入项目"映射） */
  nodeId?: string;
}

// Structured project context the workbench injects into the request so the
// backend can bias the generation (and for traceability / portfolio write-back).
//
// 上下文策略（章节级，控制成本 + 把控全局）：
// - brief：常驻注入世界观 + 用户 pinned 的自定义设定维度（势力/战力/阵营…）
// - plot_summary：性价比 summarizer 模型压缩后的滚动剧情摘要（非原始全文）
// - characters：仅「本章出场角色 + 状态变化角色」，每人带当前时间点快照
// - sections：本章按需挑选的相关自定义维度（与 brief 互补，避免全量注入）
export interface GenerationContextCharacterRelation {
  /** 对端角色名（折叠时已由前端解析，后端无需再反查 id） */
  target: string;
  /** 关系描述：如「宿敌」「师徒」「暗恋」 */
  relation: string;
}

export interface GenerationContextCharacter {
  name: string;
  /** 故事定位：主角/女主/反派/配角…或自定义文案（生成时用来把控戏份权重） */
  role?: string;
  description: string;        // 静态人设（可压缩）
  currentProfile?: string;    // 当前时间点详情（心理/关系/处境/变化）
  status: string;             // 存活/死亡/自定义（string 支持任意状态）
  change?: string;            // 本章状态变化强信号，如「刚死亡」「刚叛变」
  /** 角色关系链：与谁、什么关系（结构化，便于后端做关系张力提示） */
  relationships?: GenerationContextCharacterRelation[];
}

export interface GenerationContext {
  project_id: string;
  project_title?: string;
  summary?: string;
  plot_summary?: string;
  characters?: GenerationContextCharacter[];
  /** 大纲骨架（文本折叠，供 mock 占位与后端文本兜底） */
  outline?: string;
  /** 大纲结构化树（卷→章→节点），后端 LangGraph 可精确消费，不必反解文本 */
  outlineTree?: GenerationContextOutlineVolume[];
  sections?: { title: string; content: string }[];  // 本章相关自定义维度
  source?: 'character' | 'chapter';
  source_ref?: string;
  brief?: string;
  // 个人库本地向量检索命中的片段，随请求发后端（后端可见、可溯源，但不存不检）
  rag_chunks?: RagChunk[];
}

// 大纲三级树（与 lib/storage/backup 的 OutlineVolume 对齐，前端注入用纯结构）
export interface GenerationContextOutlineNode {
  id: string;
  title: string;
  content?: string;
  status?: 'todo' | 'writing' | 'done';
  charIds?: string[];
  sectionIds?: string[];
}
export interface GenerationContextOutlineChapter {
  id: string;
  title: string;
  nodes: GenerationContextOutlineNode[];
}
export interface GenerationContextOutlineVolume {
  id: string;
  title: string;
  chapters: GenerationContextOutlineChapter[];
}
