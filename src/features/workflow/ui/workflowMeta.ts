// src/components/workflow/workflowMeta.ts
import { LogIn, LogOut, Bot, Wrench } from 'lucide-react';
import type { WorkflowNodeKind } from '@/features/workflow';

export const KIND_META: Record<WorkflowNodeKind, { label: string; icon: typeof Bot; color: string }> = {
  input: { label: '输入', icon: LogIn, color: '#0891b2' },
  agent: { label: 'Agent', icon: Bot, color: '#9333ea' },
  tool: { label: '工具', icon: Wrench, color: '#ca8a04' },
  output: { label: '输出', icon: LogOut, color: '#16a34a' },
};
