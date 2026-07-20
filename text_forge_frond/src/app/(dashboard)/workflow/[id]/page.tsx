// src/app/(dashboard)/workflow/[id]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getWorkflow, type Workflow } from '@/features/workflow';
import { WorkflowEditor } from '@/features/workflow';
import { PageHeader } from '@/shared/components';
import { Spinner } from '@/shared/components';
import { Workflow as WorkflowIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function WorkflowDetail() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [wf, setWf] = useState<Workflow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getWorkflow(id).then((w) => { setWf(w || null); setLoading(false); }).catch(() => setLoading(false));
  }, [id]);

  if (loading) return <Spinner label="加载工作流..." />;
  if (!wf) return <PageHeader title="未找到工作流" description="该工作流不存在或已被删除" />;

  return (
    <div className="page-shell">
      <PageHeader icon={WorkflowIcon} title={wf.name} description="多 Agent 工作流编辑器" />
      <WorkflowEditor initial={wf} onSaved={() => { /* 列表由 mock 内存维护，无需同步 */ }} />
      <Button variant="ghost" size="sm" onClick={() => router.push('/workflow')}>← 返回列表</Button>
    </div>
  );
}
