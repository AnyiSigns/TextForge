// src/app/(dashboard)/workflow/new/page.tsx
'use client';

import { useMemo } from 'react';
import { WorkflowEditor, type Workflow } from '@/features/workflow';
import { useRouter } from 'next/navigation';

export default function NewWorkflow() {
  const router = useRouter();
  const wf = useMemo<Workflow>(() => ({
    id: `wf-${Date.now()}`,
    name: '未命名工作流',
    description: '',
    nodes: [],
    edges: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }), []);

  return (
    <WorkflowEditor
      initial={wf}
      onSaved={(saved) => {
        router.replace(`/workflow/${saved.id}`);
      }}
    />
  );
}
