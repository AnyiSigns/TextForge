// src/components/workflow/workflowMeta.ts

export function inferNodeKind(): 'node' {
  return 'node';
}

export const NODE_KIND_META: Record<string, { label: string }> = {
  node: { label: '角色节点' },
};
