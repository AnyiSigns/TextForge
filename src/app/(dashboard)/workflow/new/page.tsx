// src/app/(dashboard)/workflow/new/page.tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { saveWorkflow, type Workflow } from '@/features/workflow';
import { Spinner } from '@/shared/components';

export default function NewWorkflow() {
  const router = useRouter();

  useEffect(() => {
    const wf: Workflow = {
      id: `wf-${Date.now()}`,
      name: '未命名工作流',
      description: '',
      nodes: [
        { id: 'n1', kind: 'input', label: '项目上下文' },
        { id: 'n2', kind: 'agent', label: 'Agent', modelId: '', systemPrompt: '' },
        { id: 'n3', kind: 'output', label: '输出', dependsOn: ['n2'] },
      ],
      edges: [
        { from: 'n1', to: 'n2' },
        { from: 'n2', to: 'n3' },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    saveWorkflow(wf).then((saved) => router.replace(`/workflow/${saved.id}`));
  }, [router]);

  return <Spinner label="创建工作流..." />;
}
