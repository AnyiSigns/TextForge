// src/components/workflow/WorkflowEditor.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import type { Workflow, WorkflowNode } from '@/features/workflow';
import { saveWorkflow } from '@/features/workflow';
import { agentRoleById } from '@/shared/lib/agentRoles';
import { toast } from 'sonner';
import { WorkflowNodePanel } from './WorkflowNodePanel';
import { WorkflowCanvas } from './WorkflowCanvas';
import { WorkflowInspector } from './WorkflowInspector';

export function WorkflowEditor({ initial, onSaved }: { initial: Workflow; onSaved?: (wf: Workflow) => void }) {
  const initWf = { ...initial, nodes: initial.nodes ?? [], edges: initial.edges ?? [] };
  const [wf, setWf] = useState<Workflow>(initWf);
  const [selected, setSelected] = useState<string | null>(initWf.nodes[0]?.id ?? null);

  const [personalDocs, setPersonalDocs] = useState<{ id: string; name: string; uploaderName?: string }[]>([]);

  const seqRef = useRef(100);
  const nid = () => `n${Date.now()}-${seqRef.current++}`;

  const update = (patch: Partial<Workflow>) => setWf((w) => ({ ...w, ...patch }));

  const applyRole = (roleId: string) => {
    const role = agentRoleById(roleId);
    if (!role) return;
    const node: WorkflowNode = {
      id: nid(),
      label: role.short,
      systemPrompt: role.defaultPrompt,
      toolIds: [...role.recommendedTools],
    };
    update({ nodes: [...wf.nodes, node] });
    setSelected(node.id);
  };

  const removeNode = (id: string) => {
    update({
      nodes: wf.nodes.filter((n) => n.id !== id),
      edges: wf.edges.filter((e) => e.from !== id && e.to !== id),
    });
    if (selected === id) setSelected(wf.nodes[0]?.id ?? null);
  };

  const patchNode = (id: string, patch: Partial<WorkflowNode>) => {
    update({ nodes: wf.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n)) });
  };

  const reorderNodes = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const nodes = [...wf.nodes];
    const fromIdx = nodes.findIndex((n) => n.id === fromId);
    const toIdx = nodes.findIndex((n) => n.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const [moved] = nodes.splice(fromIdx, 1);
    nodes.splice(toIdx, 0, moved);
    update({ nodes });
  };

  const selectedNode = wf.nodes.find((n) => n.id === selected) || null;
  const nodeHasPersonalRag = !!selectedNode?.toolIds?.some((t) => t === 'rag:personal' || t === 'rag:both');

  useEffect(() => {
    if (!nodeHasPersonalRag) return;
    let alive = true;
    import('@/lib/knowledge').then(({ ragClient }) =>
      ragClient.listPersonal().then((list) => {
        if (alive) setPersonalDocs(list.map((d) => ({ id: d.id, name: d.name, uploaderName: d.uploaderName })));
      }).catch(() => {})
    );
    return () => { alive = false; };
  }, [nodeHasPersonalRag, selected]);

  const handleSave = async () => {
    try {
      const nodes = wf.nodes;
      const edges = nodes.flatMap((n) => (n.upstreams || []).map((from) => ({ from, to: n.id })));
      const payload = { ...wf, nodes, edges };
      const saved = await saveWorkflow(payload);
      setWf(saved);
      onSaved?.(saved);
      toast.success('工作流已保存');
    } catch (e) {
      toast.error('保存失败', { description: e instanceof Error ? e.message : '未知错误' });
    }
  };

  return (
    <div className="grid lg:grid-cols-[200px_1fr_320px] gap-4">
      <WorkflowNodePanel
        onApplyRole={applyRole}
      />
      <WorkflowCanvas
        wf={wf}
        selected={selected}
        onName={(v) => update({ name: v })}
        onSelect={setSelected}
        onRemoveNode={removeNode}
        onReorder={reorderNodes}
        onSave={handleSave}
      />
      <WorkflowInspector
        wf={wf}
        selectedNode={selectedNode}
        personalDocs={personalDocs}
        onPatchNode={patchNode}
      />
    </div>
  );
}
