// src/lib/api/workflowTypes.ts

export interface WorkflowNode {
  id: string;
  label: string;
  systemPrompt?: string;
  upstreams?: string[];
  executor?: 'main' | 'audit' | 'tool';
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
  builtin?: boolean;
}

export interface WorkflowTemplate extends Workflow {
  builtin: true;
  tags?: string[];
}

export interface WorkflowRunStep {
  nodeId: string;
  label: string;
  output: string;
  status: 'running' | 'done' | 'error';
  systemPrompt?: string;
}

export interface ListWorkflowsResponse { workflows: Workflow[]; }
export interface WorkflowResponse { workflow: Workflow; }

export interface RunWorkflowOptions {
  onStep?: (nodeId: string, label: string, output: string, systemPrompt?: string, status?: 'running' | 'done') => void;
  bookId?: number;
  projectContext?: import('@/types').GenerationContext;
  generate?: (
    node: WorkflowNode,
    context: string,
    ragChunks?: import('@/types').RagChunk[],
    systemPrompt?: string,
    projectContext?: import('@/types').GenerationContext,
  ) => Promise<string> | string;
  visibleNodeIds?: Set<string> | string[];
  labelToIdMap?: Map<string, string>;
  shouldPause?: () => boolean;
  isAborted?: () => boolean;
  signal?: AbortSignal;
  pausePollInterval?: number;
}
