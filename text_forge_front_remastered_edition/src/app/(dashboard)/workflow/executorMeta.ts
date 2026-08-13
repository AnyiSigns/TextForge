/**
 * 工作流「执行器（executor）/ 层级（layer）」共享元信息。
 *
 * 此前译名与配色分散在 [id]/page.tsx（getLayer）、components/NodePalette.tsx
 * （EXECUTOR_SHORT）、components/RoleNode.tsx（EXECUTOR_LABEL / LAYER_*）三处，
 * 同一 executor 在不同位置译名不一致。统一收敛到本模块，三处均从此导入。
 */

/** 后端 WorkflowNode.executor 的取值域（与 schema/workflow.py 一致） */
export type ExecutorKind = 'main' | 'audit' | 'router' | 'tool';

/** 节点所属层级（决策 / 执行 / 审计），仅前端用于分组与配色 */
export type LayerKind = 'decision' | 'execution' | 'audit';

/** 执行器中文全名：节点卡片等宽位展示 */
export const EXECUTOR_LABEL: Record<string, string> = {
  main: '主模型',
  audit: '审计模型',
  router: '路由模型',
  tool: '工具模型',
};

/** 执行器中文短名：角色面板等窄位展示，为 EXECUTOR_LABEL 的同词根缩写 */
export const EXECUTOR_SHORT: Record<string, string> = {
  main: '主模型',
  audit: '审计',
  router: '路由',
  tool: '工具',
};

/** 层级底色/描边（RoleNode 卡片） */
export const LAYER_COLORS: Record<string, string> = {
  decision: 'bg-foreground/[0.06] border-foreground/[0.12]',
  execution: 'bg-foreground/[0.10] border-foreground/[0.18]',
  audit: 'bg-foreground/[0.15] border-foreground/[0.25]',
};

/** 层级徽标文案（RoleNode 卡片顶部） */
export const LAYER_BADGE: Record<string, string> = {
  decision: '🧠 决策层',
  execution: '✍️ 执行层',
  audit: '🔍 审计层',
};

/** 层级副标题文字色（RoleNode 卡片底部执行器名） */
export const LAYER_LABEL_STYLE: Record<string, string> = {
  decision: 'text-foreground/40',
  execution: 'text-foreground/50',
  audit: 'text-foreground/60',
};

/** 取执行器中文全名（未知 executor 回退主模型） */
export function executorLabel(executor: string | undefined): string {
  return EXECUTOR_LABEL[executor || 'main'] || EXECUTOR_LABEL.main;
}

/** 取执行器中文短名（未知 executor 回退主模型） */
export function executorShort(executor: string | undefined): string {
  return EXECUTOR_SHORT[executor || 'main'] || EXECUTOR_SHORT.main;
}

/** 由 executor + 节点名推断层级：main 档位无专用分支，按 label 中文关键词兜底 */
export function getLayer(executor: string, label: string): LayerKind {
  if (executor === 'audit') return 'audit';
  if (executor === 'router') return 'decision';
  if (executor === 'tool') return 'execution';
  if (label.includes('策划') || label.includes('分镜')) return 'decision';
  return 'execution';
}
