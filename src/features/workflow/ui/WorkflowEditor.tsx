// src/components/workflow/WorkflowEditor.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import type { Workflow, WorkflowNode, WorkflowNodeKind } from '@/features/workflow';
import { runWorkflow, saveWorkflow, workflowToSteps } from '@/features/workflow';
import { loadOutline, type OutlineVolume } from '@/lib/storage/backup';
import { DEFAULT_TEAM_TEMPLATE, agentRoleById } from '@/shared/lib/agentRoles';
import { useProjectStore } from '@/features/projects';
import { toast } from 'sonner';
import { WorkflowNodePanel } from './WorkflowNodePanel';
import { WorkflowCanvas } from './WorkflowCanvas';
import { WorkflowInspector } from './WorkflowInspector';

export function WorkflowEditor({ initial, onSaved }: { initial: Workflow; onSaved?: (wf: Workflow) => void }) {
  const [wf, setWf] = useState<Workflow>(initial);
  const [selected, setSelected] = useState<string | null>(initial.nodes[0]?.id ?? null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Record<string, string>>({});

  const [pickingRole, setPickingRole] = useState(false);
  const [targetProject, setTargetProject] = useState<string>('');
  const [writingProject, setWritingProject] = useState(false);
  const projects = useProjectStore((s) => s.projects);

  const [personalDocs, setPersonalDocs] = useState<{ id: string; name: string; uploaderName?: string }[]>([]);

  const seqRef = useRef(100);
  const nid = () => `n${Date.now()}-${seqRef.current++}`;

  const update = (patch: Partial<Workflow>) => setWf((w) => ({ ...w, ...patch, updatedAt: new Date().toISOString() }));

  const addNode = (kind: WorkflowNodeKind) => {
    if (kind === 'agent') { setPickingRole(true); return; }
    const node: WorkflowNode = { id: nid(), kind, label: kind === 'input' ? '输入' : kind === 'output' ? '输出' : '工具', systemPrompt: undefined };
    update({ nodes: [...wf.nodes, node] });
    setSelected(node.id);
  };

  const applyRole = (roleId: string) => {
    const role = agentRoleById(roleId);
    if (!role) return;
    const node: WorkflowNode = {
      id: nid(),
      kind: 'agent',
      label: role.short,
      modelId: '',
      systemPrompt: role.defaultPrompt,
      toolIds: role.recommendedTools,
    };
    update({ nodes: [...wf.nodes, node] });
    setSelected(node.id);
    setPickingRole(false);
  };

  const applyDefaultTeam = () => {
    const nodes: WorkflowNode[] = DEFAULT_TEAM_TEMPLATE.map((t) => {
      const role = agentRoleById(t.roleId)!;
      return {
        id: nid(),
        kind: 'agent' as WorkflowNodeKind,
        label: role.short,
        systemPrompt: role.defaultPrompt,
        toolIds: role.recommendedTools,
      };
    });
    const edges = nodes.slice(1).map((n, i) => ({ from: nodes[i].id, to: n.id }));
    update({ nodes: [...wf.nodes, ...nodes], edges: [...wf.edges, ...edges] });
    setSelected(nodes[0]?.id ?? null);
    toast.success('已加入默认 Agent 团队（可继续调整）');
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

  const toggleDep = (id: string, dep: string) => {
    const node = wf.nodes.find((n) => n.id === id);
    if (!node) return;
    const deps = node.dependsOn || [];
    const next = deps.includes(dep) ? deps.filter((d) => d !== dep) : [...deps, dep];
    patchNode(id, { dependsOn: next });
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

  const handleRun = async () => {
    setRunning(true);
    setResults({});
    try {
      const steps = await runWorkflow(wf.id, '');
      const map: Record<string, string> = {};
      steps.forEach((s) => { map[s.nodeId] = s.output; });
      setResults(map);
      toast.success('工作流运行完成（mock）');
    } catch (e) {
      toast.error('运行失败', { description: e instanceof Error ? e.message : '未知错误' });
    } finally {
      setRunning(false);
    }
  };

  const handleRunToProject = async () => {
    if (!targetProject) { toast.error('请先选择目标项目'); return; }
    setWritingProject(true);
    try {
      const runs = await runWorkflow(wf.id, '');
      const outline: OutlineVolume[] = await loadOutline(targetProject).catch(() => []);
      const steps = workflowToSteps(runs, outline);
      const draft = await useProjectStore.getState().getDraft(targetProject);
      const prev = draft ?? [];
      await useProjectStore.getState().saveDraft(targetProject, [...prev, ...steps]);
      const proj = projects.find((p) => p.id === targetProject);
      toast.success(`已写入《${proj?.title ?? '项目'}》${steps.length} 个环节（可在项目工作台查看）`);
    } catch (e) {
      toast.error('写入失败', { description: e instanceof Error ? e.message : '未知错误' });
    } finally {
      setWritingProject(false);
    }
  };

  const handleSave = async () => {
    try {
      const saved = await saveWorkflow(wf);
      onSaved?.(saved);
      toast.success('工作流已保存');
    } catch (e) {
      toast.error('保存失败', { description: e instanceof Error ? e.message : '未知错误' });
    }
  };

  return (
    <div className="grid lg:grid-cols-[200px_1fr_320px] gap-4">
      <WorkflowNodePanel
        pickingRole={pickingRole}
        onAddNode={addNode}
        onApplyDefaultTeam={applyDefaultTeam}
        onApplyRole={applyRole}
      />
      <WorkflowCanvas
        wf={wf}
        selected={selected}
        running={running}
        writingProject={writingProject}
        results={results}
        projects={projects}
        targetProject={targetProject}
        onName={(v) => update({ name: v })}
        onSelect={setSelected}
        onRemoveNode={removeNode}
        onReorder={reorderNodes}
        onSave={handleSave}
        onRun={handleRun}
        onTargetProject={setTargetProject}
        onRunToProject={handleRunToProject}
      />
      <WorkflowInspector
        wf={wf}
        selectedNode={selectedNode}
        personalDocs={personalDocs}
        nodeHasPersonalRag={nodeHasPersonalRag}
        onPatchNode={patchNode}
        onToggleDep={toggleDep}
      />
    </div>
  );
}
