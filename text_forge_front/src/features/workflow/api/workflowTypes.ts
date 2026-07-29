// src/lib/api/workflowTypes.ts
import type { RagFilter, RagChunk } from '@/types';

export type ContextFieldKey = 'book_info' | 'setting' | 'characters' | 'chapters' | 'outline' | 'volumes';

export interface WorkflowNode {
  id: string;
  label: string;
  systemPrompt?: string;
  contextFields?: ContextFieldKey[];
  ragFilter?: RagFilter;
  ragTopK?: number;
  personalRagTopK?: number;
  toolIds?: string[];
  upstreams?: string[];
}

export interface ContextFieldGroup {
  label: string;
  fields: { key: ContextFieldKey; label: string; alwaysOn?: boolean }[];
}

export const CONTEXT_FIELD_GROUPS: ContextFieldGroup[] = [
  { label: '基础信息', fields: [{ key: 'book_info', label: '书名与描述', alwaysOn: true }] },
  { label: '创作设定', fields: [{ key: 'setting', label: '创作设定', alwaysOn: true }] },
  { label: '内容注入', fields: [
      { key: 'characters', label: '角色' },
      { key: 'chapters', label: '章节' },
      { key: 'outline', label: '大纲' },
      { key: 'volumes', label: '卷' },
  ]},
];

export const DEFAULT_CONTEXT_FIELDS: ContextFieldKey[] = [
  'book_info',
  'setting',
];

export const BACKEND_CONTEXT_FIELD_MAP: Record<ContextFieldKey, string> = {
  book_info: 'book_info',
  setting: 'setting',
  characters: 'characters',
  chapters: 'chapter_content',
  outline: 'outline_structure',
  volumes: 'volumes',
};

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
    ragChunks?: RagChunk[],
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
