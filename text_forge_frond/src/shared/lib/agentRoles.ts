// src/lib/workflow/agentRoles.ts
//
// Agent role preset library. Each role is a reusable agent-node template the
// user picks when creating an agent node in WorkflowEditor. Keeps users from
// writing nodes from scratch.

export type AgentTool = 'rag:personal' | 'rag:public' | 'rag:both' | 'web';

export const RAG_SCOPE_LABEL: Record<string, string> = {
  'rag:personal': '参考我的资料',
  'rag:public': '参考公共资料',
  'rag:both': '参考全部资料',
  web: '联网查',
};

export type AgentTier = 'cheap' | 'standard';

export interface AgentRole {
  id: string;
  name: string;
  short: string;
  color: string;
  tier: AgentTier;
  defaultPrompt: string;
  recommendedTools: AgentTool[];
  contextHint: string;
}

export const AGENT_ROLES: AgentRole[] = [
  {
    id: 'planner',
    name: '策划 / 创意官',
    short: '策划',
    color: '#0891b2',
    tier: 'standard',
    defaultPrompt:
      '你是小说策划。只输出：核心创意点、目标读者、一句话钩子、3 个关键悬念。不要展开正文。控制在 200 字内。',
    recommendedTools: ['rag:personal'],
    contextHint: '需要：类型、基调、创作禁忌',
  },
  {
    id: 'architect',
    name: '架构师 / 规划师',
    short: '架构',
    color: '#7c3aed',
    tier: 'standard',
    defaultPrompt:
      '你是故事架构师。基于上游产出，输出：三幕结构、章节节拍表（仅标题+一句话）、伏笔清单。不写正文。控制在 300 字内。',
    recommendedTools: ['rag:personal'],
    contextHint: '需要：策划结论、世界观',
  },
  {
    id: 'producer',
    name: '总编 / 制作人',
    short: '总编',
    color: '#db2777',
    tier: 'cheap',
    defaultPrompt:
      '你是总编。审视上游结构，给出：可行性判定（过/改）、3 条修改建议、节奏风险。极简输出。控制在 150 字内。',
    recommendedTools: [],
    contextHint: '需要：架构、目标字数',
  },
  {
    id: 'worldbuilder',
    name: '世界构建师',
    short: '世界',
    color: '#0d9488',
    tier: 'standard',
    defaultPrompt:
      '你是世界构建师。只补充本章用得上的设定：地点/规则/势力关系，且与已有世界观一致。无关设定不写。控制在 250 字内。',
    recommendedTools: ['rag:personal'],
    contextHint: '需要：世界观 brief、相关设定维度',
  },
  {
    id: 'character_designer',
    name: '角色设计师',
    short: '角色',
    color: '#ea580c',
    tier: 'standard',
    defaultPrompt:
      '你是角色设计师。输出本章出场角色的小传要点：动机、当前处境、与他人的关系张力。仅本章相关。控制在 250 字内。',
    recommendedTools: ['rag:personal'],
    contextHint: '需要：出场角色 currentProfile、状态',
  },
  {
    id: 'writer',
    name: '写手 / 作家',
    short: '写手',
    color: '#16a34a',
    tier: 'standard',
    defaultPrompt:
      '你是主笔写手。基于上游所有要点写本章正文。严格遵循：不重复前文、不偏离架构、保持基调。只输出正文。',
    recommendedTools: ['rag:personal', 'web'],
    contextHint: '需要：架构+角色+世界+压缩剧情摘要（避免重发全文）',
  },
  {
    id: 'auditor',
    name: '审计员 / 审校官',
    short: '审计',
    color: '#ca8a04',
    tier: 'cheap',
    defaultPrompt:
      '你是审校。只列出：硬伤（事实/连续性矛盾）、OOC（角色崩坏）、冗余段落。不重写。控制在 150 字内。',
    recommendedTools: [],
    contextHint: '需要：本章正文 + 角色设定（比对一致性）',
  },
  {
    id: 'reviser',
    name: '修订师 / 润色师',
    short: '修订',
    color: '#2563eb',
    tier: 'cheap',
    defaultPrompt:
      '你是润色师。仅做最小必要修改：修硬伤、顺逻辑、去啰嗦。保留作者原意与文风，不大幅重写。输出修订后全文。',
    recommendedTools: [],
    contextHint: '需要：审计意见 + 本章正文',
  },
  {
    id: 'archivist',
    name: '复盘师 / 档案员',
    short: '复盘',
    color: '#64748b',
    tier: 'cheap',
    defaultPrompt:
      '你是档案员。把本章压缩为：1) 剧情摘要（≤120字）2) 角色状态变更 3) 待回收伏笔。供后续章节注入，避免重发全文。',
    recommendedTools: [],
    contextHint: '需要：本章全文（用于生成摘要，结果回写 plot_summary）',
  },
];

export const AGENT_ROLE_MAP: Record<string, AgentRole> = Object.fromEntries(
  AGENT_ROLES.map((r) => [r.id, r]),
);

// 二级索引：label（中文，如「策划」）→ 角色，供节点按 label 反查角色预设。
export const AGENT_ROLE_BY_LABEL: Record<string, AgentRole> = Object.fromEntries(
  AGENT_ROLES.map((r) => [r.short, r]).concat(AGENT_ROLES.map((r) => [r.name, r])),
);

export const DEFAULT_TEAM_TEMPLATE: { roleId: string; label: string }[] = [
  { roleId: 'planner', label: '策划' },
  { roleId: 'architect', label: '架构' },
  { roleId: 'producer', label: '总编把关' },
  { roleId: 'worldbuilder', label: '世界构建' },
  { roleId: 'character_designer', label: '角色设计' },
  { roleId: 'writer', label: '写手' },
  { roleId: 'auditor', label: '审计' },
  { roleId: 'reviser', label: '修订' },
  { roleId: 'archivist', label: '复盘归档' },
];

// 同时支持按 id 或 label（中文 short/name）查询角色预设。
export function agentRoleById(idOrLabel: string): AgentRole | undefined {
  return AGENT_ROLE_MAP[idOrLabel] ?? AGENT_ROLE_BY_LABEL[idOrLabel];
}

// 内置 7-Agent 流水线的「节点 id → 展示名」纯数据映射（不含 UI 字段）。
// 供 lib 层（chapter.ts）与组件层（WorkflowGraph）共用，避免 lib 反向依赖组件。
export const BUILTIN_AGENT_LABELS: Record<string, string> = {
  planner: '策划',
  world: '世界观',
  character: '角色',
  outline: '大纲',
  writer: '写作',
  reviewer: '审校',
  editor: '总编',
};

export function builtinAgentLabel(id: string | undefined): string | undefined {
  return id ? BUILTIN_AGENT_LABELS[id] : undefined;
}

// 角色故事定位（CharacterRole）→ 中文展示名，单一真相来源。
// 供 page.tsx 的 buildContext 与 ProjectCharactersTab 共用，避免多处重复映射分叉。
export const CHARACTER_ROLE_LABELS: Record<string, string> = {
  protagonist: '主角',
  heroine: '女主',
  deuteragonist: '男二',
  antagonist: '反派',
  supporting: '配角',
};

export function characterRoleLabel(role: string | undefined): string | undefined {
  if (!role) return undefined;
  if (role === 'custom') return undefined;
  return CHARACTER_ROLE_LABELS[role] ?? role;
}
