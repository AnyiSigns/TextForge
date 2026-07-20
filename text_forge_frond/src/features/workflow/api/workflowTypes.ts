// src/lib/api/workflowTypes.ts
import type { RagFilter, RagChunk } from '@/types';

export type WorkflowNodeKind = 'input' | 'agent' | 'tool' | 'output';

export interface WorkflowNode {
  id: string;
  kind: WorkflowNodeKind;
  label: string;
  modelId?: string;          // agent 节点绑定的模型 id（来自模型库）
  systemPrompt?: string;     // agent 节点的角色/系统提示词
  toolIds?: string[];        // agent 节点可调用工具（RAG/搜索/...）
  dependsOn?: string[];      // 依赖的节点 id（等价 edges）
  tier?: 'cheap' | 'standard'; // 模型档位（显式，避免后端按中文 label 反解角色）
  roleId?: string;             // 关联角色预设 id（agentRoles），优先于 label 反查角色
  // RAG 检索配置（仅 rag:personal / rag:both 节点生效）
  ragFilter?: RagFilter;     // 限定范围：文档/作者；sample 覆盖自动 query
  ragTopK?: number;          // 返回片段数（默认 4）
}

export interface WorkflowEdge {
  from: string;
  to: string;
}

export interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string;
  builtin?: boolean;        // 内置流水线（不可删除，项目默认使用）
}

export interface WorkflowRunStep {
  nodeId: string;
  label: string;
  output: string;
  status: 'running' | 'done' | 'error';
  /** 该节点实际采用的系统提示词（角色预设 + 节点补充合并），作为 system 消息发送 */
  systemPrompt?: string;
}

export interface ListWorkflowsResponse { workflows: Workflow[]; }
export interface WorkflowResponse { workflow: Workflow; }

// 运行选项：实时回调、项目上下文、暂停/取消信号等。
export interface RunWorkflowOptions {
  /** 每个 agent 节点产出后实时回调（用于项目页流式注入 steps） */
  onStep?: (nodeId: string, label: string, output: string, systemPrompt?: string) => void;
  /** 项目 id（仅用于日志/后续扩展） */
  projectId?: string;
  /** 节点生成器（可注入真实模型调用；默认本地占位）。
   *  - context（字符串）：上游 fan-in 产出 + 工具/检索片段，作为模型 **user 消息**；
   *  - systemPrompt：角色预设 + 节点补充，作为模型 **system 消息**；
   *  - projectContext：完整 GenerationContext（brief/角色/维度/摘要/大纲），
   *    作为 **设定基座**，后端生成器直接发 LangGraph 子图 state（结构化，不依赖文本反解）。
   *  三者职责分离，互不挤占同一接口字段。 */
  generate?: (
    node: WorkflowNode,
    context: string,
    tier: 'cheap' | 'standard',
    ragChunks?: RagChunk[],
    systemPrompt?: string,
    projectContext?: import('@/types').GenerationContext,
    /** C4/C10/C11: 该节点实际采用的语言模型 id（按 tier 解析用户 category:llm 默认模型），后端凭 id 取配置 */
    modelId?: string,
  ) => Promise<string> | string;
  /** 是否在 agent 节点间演示流式延迟（mock 观感） */
  simulateDelay?: boolean;
  /** 暂停信号：返回 true 时，运行在节点之间挂起，直至返回 false（轮询） */
  shouldPause?: () => boolean;
  /** 取消信号：返回 true 时，运行在中止前停止（不产出后续步骤） */
  isAborted?: () => boolean;
  /** 节点之间轮询暂停/取消的间隔（毫秒），默认 200 */
  pausePollInterval?: number;
}
