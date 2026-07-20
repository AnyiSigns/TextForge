// features/workflow 公开 API。
// 其它切片/页面只应从 '@/features/workflow' 消费，禁止深路径直连内部文件。

// ---- UI 组件 ----
export { RagConfigPopover } from './ui/RagConfigPopover';
export { WorkflowCanvas } from './ui/WorkflowCanvas';
export { WorkflowEditor } from './ui/WorkflowEditor';
export { WorkflowInspector } from './ui/WorkflowInspector';
export { WorkflowNodePanel } from './ui/WorkflowNodePanel';
export { KIND_META } from './ui/workflowMeta';

// ---- API ----
export {
  listWorkflows,
  listWorkflowsWithBuiltin,
  getWorkflow,
  saveWorkflow,
  deleteWorkflow,
  countWorkflowUsages,
  runWorkflow,
  workflowToSteps,
} from './api/workflow';
export type {
  Workflow,
  WorkflowNode,
  WorkflowNodeKind,
  WorkflowRunStep,
  RunWorkflowOptions,
  ListWorkflowsResponse,
  WorkflowResponse,
} from './api/workflow';
