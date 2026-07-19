// src/components/workflow/WorkflowEditor.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Trash2, Plus, Play, Save, Bot, Wrench, LogIn, LogOut, Cpu, ArrowDown, SendToBack, Loader2, GripVertical, HelpCircle } from 'lucide-react';
import type { Workflow, WorkflowNode, WorkflowNodeKind } from '@/lib/api/workflow';
import { runWorkflow, saveWorkflow, workflowToSteps } from '@/lib/api/workflow';
import { loadOutline, type OutlineVolume } from '@/lib/storage/backup';
import { AGENT_ROLES, DEFAULT_TEAM_TEMPLATE, agentRoleById, RAG_SCOPE_LABEL } from '@/lib/workflow/agentRoles';
import { RagConfigPopover } from './RagConfigPopover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useProjectStore } from '@/lib/stores/projectStore';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const KIND_META: Record<WorkflowNodeKind, { label: string; icon: typeof Bot; color: string }> = {
  input: { label: '输入', icon: LogIn, color: '#0891b2' },
  agent: { label: 'Agent', icon: Bot, color: '#9333ea' },
  tool: { label: '工具', icon: Wrench, color: '#ca8a04' },
  output: { label: '输出', icon: LogOut, color: '#16a34a' },
};

let seq = 100;
const nid = () => `n${Date.now()}-${seq++}`;

export function WorkflowEditor({ initial, onSaved }: { initial: Workflow; onSaved?: (wf: Workflow) => void }) {
  const [wf, setWf] = useState<Workflow>(initial);
  const [selected, setSelected] = useState<string | null>(initial.nodes[0]?.id ?? null);
  const [running, setRunning] = useState(false);
  const [results, setResults] = useState<Record<string, string>>({});
  const [expandedResult, setExpandedResult] = useState<string | null>(null);
  // 拖拽排序（零依赖 HTML5 DnD）
  const dragId = useRef<string | null>(null);

  const [pickingRole, setPickingRole] = useState(false);
  const [targetProject, setTargetProject] = useState<string>('');
  const [writingProject, setWritingProject] = useState(false);
  const projects = useProjectStore((s) => s.projects);

  const [personalDocs, setPersonalDocs] = useState<{ id: string; name: string; uploaderName?: string }[]>([]);

  const update = (patch: Partial<Workflow>) => setWf((w) => ({ ...w, ...patch, updatedAt: new Date().toISOString() }));

  const addNode = (kind: WorkflowNodeKind) => {
    if (kind === 'agent') { setPickingRole(true); return; }
    const node: WorkflowNode = { id: nid(), kind, label: KIND_META[kind].label, systemPrompt: undefined };
    update({ nodes: [...wf.nodes, node] });
    setSelected(node.id);
  };

  // 选用工种预设：自动带提示词/配色/推荐工具，省去空白起步
  const applyRole = (roleId: string) => {
    const role = agentRoleById(roleId);
    if (!role) return;
    const node: WorkflowNode = {
      id: nid(),
      kind: 'agent',
      label: role.short,
      modelId: role.tier === 'cheap' ? '' : '',
      systemPrompt: role.defaultPrompt,
      toolIds: role.recommendedTools,
    };
    update({ nodes: [...wf.nodes, node] });
    setSelected(node.id);
    setPickingRole(false);
  };

  // 一键套用默认 Agent 团队（线性流水线，cheap 节点承担压缩/审校/复盘）
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

  // 拖拽排序：把 from 节点移动到 to 节点的位置
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

  // 选中的节点含个人库 RAG 时，拉取个人文档列表供悬浮窗勾选
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
    setExpandedResult(null);
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

  // 运行并把结果写入目标项目（mock 期：转 steps 存入项目草稿，项目工作台可见）
  const handleRunToProject = async () => {
    if (!targetProject) { toast.error('请先选择目标项目'); return; }
    setWritingProject(true);
    try {
      const runs = await runWorkflow(wf.id, '');
      const outline: OutlineVolume[] = await loadOutline(targetProject).catch(() => []);
      const steps = workflowToSteps(runs, outline);
      const { useProjectStore: ps } = await import('@/lib/stores/projectStore');
      const draft = await ps.getState().getDraft(targetProject);
      const prev = draft ?? [];
      await ps.getState().saveDraft(targetProject, [...prev, ...steps]);
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
      {/* 左：节点面板 */}
      <div className="space-y-3">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">步骤</p>
        <div className="space-y-2">
          {(Object.keys(KIND_META) as WorkflowNodeKind[]).map((k) => {
            const m = KIND_META[k];
            const Icon = m.icon;
            return (
              <Button key={k} variant="outline" size="sm" className="w-full justify-start glass-surface" onClick={() => addNode(k)}>
                <Plus className="w-3.5 h-3.5 mr-1.5" />
                <Icon className="w-3.5 h-3.5 mr-1.5" style={{ color: m.color }} />
                {m.label}
              </Button>
            );
          })}
          <Button size="sm" className="w-full justify-start mt-2" variant="secondary" onClick={applyDefaultTeam}>
            <Bot className="w-3.5 h-3.5 mr-1.5" /> 一键用默认 Agent 团队
          </Button>

          {/* Agent 工种预设选择 */}
          {pickingRole && (
            <div className="mt-2 space-y-1.5 rounded-xl border border-border/60 p-2">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">选择 Agent 工种</p>
              {AGENT_ROLES.map((r) => (
                <button key={r.id} onClick={() => applyRole(r.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-accent/40"
                  title={r.contextHint}>
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ background: r.color }} />
                  <span className="flex-1 truncate">{r.name}</span>
                  <span className="text-[10px] text-muted-foreground">{r.tier === 'cheap' ? '省' : '标'}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 中：画布（按依赖纵向排列的占位布局） */}
      <Card className="glass-card">
        <CardContent className="space-y-3 py-4">
          <div className="flex items-center justify-between">
            <Input
              value={wf.name}
              onChange={(e) => update({ name: e.target.value })}
              className="font-medium max-w-xs"
            />
            <div className="flex gap-2 flex-wrap items-center">
              <Button size="sm" variant="outline" onClick={handleSave}><Save className="w-4 h-4 mr-1.5" /> 保存</Button>
              <Button size="sm" onClick={handleRun} disabled={running}><Play className="w-4 h-4 mr-1.5" /> {running ? '运行中' : '运行'}</Button>
              <div className="flex items-center gap-1.5 ml-1">
                <Select value={targetProject} onValueChange={(v) => setTargetProject(v ?? '')}>
                  <SelectTrigger className="w-[160px] h-7 text-xs"><SelectValue placeholder="选目标项目">{(v: string) => projects.find((p) => p.id === v)?.title ?? v}</SelectValue></SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Button size="sm" variant="secondary" onClick={handleRunToProject} disabled={writingProject || !targetProject}>
                  {writingProject ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <SendToBack className="w-4 h-4 mr-1.5" />}
                  写入项目
                </Button>
              </div>
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground mt-2">
            这是「全局模板」：保存后可在任意项目的「工作台 → 创作流水线」中选用，做到多模板应用。
          </p>

          <AnimatePresence initial={false}>
            {wf.nodes.map((node, i) => {
              const m = KIND_META[node.kind];
              const Icon = m.icon;
              // agent 节点用工种配色（若匹配预设）
              const roleColor = node.kind === 'agent'
                ? (AGENT_ROLES.find((r) => r.name === node.label)?.color ?? m.color)
                : m.color;
              return (
                <motion.div
                  key={node.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  draggable
                  onDragStart={() => { dragId.current = node.id; }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { if (dragId.current) reorderNodes(dragId.current, node.id); dragId.current = null; }}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-colors relative',
                    selected === node.id ? 'border-primary/40 bg-primary/5' : 'border-border/50 hover:bg-accent/30'
                  )}
                  onClick={() => setSelected(node.id)}
                >
                  <span className="cursor-grab active:cursor-grabbing text-muted-foreground/50 hover:text-muted-foreground shrink-0" title="拖拽排序"
                    onMouseDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
                    <GripVertical className="w-4 h-4" />
                  </span>
                  <span className="grid place-items-center w-9 h-9 rounded-lg shrink-0" style={{ background: `${roleColor}1a`, color: roleColor }}>
                    <Icon className="w-4 h-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{node.label}</p>
                    <p className="text-xs text-muted-foreground">
                      {m.label}
                      {node.toolIds?.length ? ` · ${node.toolIds.join('/')}` : ''}
                      {results[node.id] ? ' · 已运行' : ''}
                    </p>
                  </div>
                  {results[node.id] && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setExpandedResult(expandedResult === node.id ? null : node.id); }}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/15 text-green-600 hover:bg-green-500/25"
                      title="查看输出"
                    >已运行</button>
                  )}
                  <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={(e) => { e.stopPropagation(); removeNode(node.id); }}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                  {i < wf.nodes.length - 1 && <ArrowDown className="w-4 h-4 text-muted-foreground/40 absolute" />}
                  {expandedResult === node.id && results[node.id] && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="absolute left-3 right-3 top-full mt-1 z-10 rounded-lg border border-border/60 bg-popover/95 backdrop-blur shadow-elegant p-3 text-xs whitespace-pre-wrap break-words max-h-48 overflow-y-auto"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <p className="font-medium text-muted-foreground mb-1">{node.label} · 运行输出</p>
                      {results[node.id]}
                    </motion.div>
                  )}
                </motion.div>
              );
            })}
          </AnimatePresence>
          {wf.nodes.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">从左侧添加步骤开始编排</p>
          )}

          {/* 运行结果逐步面板（#9：运行后可见每步输出，点展开查看正文） */}
          {Object.keys(results).length > 0 && (
            <div className="mt-4 space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">运行结果（{Object.keys(results).length} 步）</p>
              <div className="rounded-xl border border-border/50 overflow-hidden divide-y divide-border/40">
                {wf.nodes.map((node) => results[node.id] && (
                  <div key={node.id} className="text-sm">
                    <button
                      type="button"
                      onClick={() => setExpandedResult(expandedResult === node.id ? null : node.id)}
                      className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left hover:bg-accent/30"
                    >
                      <span className="font-medium truncate">{node.label}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0">{expandedResult === node.id ? '收起' : '展开'}</span>
                    </button>
                    {expandedResult === node.id && (
                      <pre className="px-3 pb-3 text-xs text-muted-foreground whitespace-pre-wrap break-words max-h-56 overflow-y-auto">{results[node.id]}</pre>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 右：属性 */}
      <Card className="glass-card">
        <CardContent className="space-y-4 py-4">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">属性</p>
          {!selectedNode ? (
            <p className="text-sm text-muted-foreground">选择一个步骤编辑</p>
          ) : (
            <>
              <div className="space-y-1">
                <Label>名称</Label>
                <Input value={selectedNode.label} onChange={(e) => patchNode(selectedNode.id, { label: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label>类型</Label>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Cpu className="w-4 h-4" /> {KIND_META[selectedNode.kind].label}
                </div>
              </div>
              {selectedNode.kind === 'agent' && (
                <>
                  <div className="space-y-1">
                    <Label>系统提示词 / 角色设定</Label>
                    <textarea
                      value={selectedNode.systemPrompt || ''}
                      onChange={(e) => patchNode(selectedNode.id, { systemPrompt: e.target.value })}
                      rows={5}
                      className="w-full rounded-xl border border-border bg-background/50 p-3 text-sm resize-none"
                      placeholder="例如：根据项目设定生成本章标题与大纲要点"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>挂载工具（按需，省 token 不要全开）</Label>
                    <div className="flex flex-wrap gap-2">
                      {(['rag:personal', 'rag:public', 'rag:both', 'web'] as const).map((t) => {
                        const on = (selectedNode.toolIds || []).includes(t);
                        return (
                          <button key={t} type="button" onClick={() => {
                            const cur = selectedNode.toolIds || [];
                            patchNode(selectedNode.id, { toolIds: on ? cur.filter((x) => x !== t) : [...cur, t] });
                          }}
                            className={cn('px-2 py-1 rounded-full text-xs border', on ? 'bg-primary text-primary-foreground border-primary' : 'border-border')}>
                            {RAG_SCOPE_LABEL[t] ?? t}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-[10px] text-muted-foreground">个人库=在本机检索，资料与检索都在你本地；公共库=由服务端检索。</p>
                  </div>

                  {/* RAG 检索设置悬浮窗（仅个人库相关时显示） */}
                  {nodeHasPersonalRag && (
                    <div className="space-y-1 pt-1">
                      <Label className="flex items-center gap-1">个人库检索设置
                        <span className="relative inline-flex group">
                          <HelpCircle className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
                          <span className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-full mb-1.5 w-48 rounded-lg bg-popover text-popover-foreground text-[11px] leading-snug p-2 shadow-elegant opacity-0 group-hover:opacity-100 transition-opacity z-50">
                            决定这一步写的时候，怎么从你本机的资料里找参考。默认按你写的内容自动找；也能限定某本书/某作者，或贴一段样本找相似的。
                          </span>
                        </span>
                      </Label>
                      <RagConfigPopover
                        filter={selectedNode.ragFilter}
                        docOptions={personalDocs}
                        onChange={(f) => patchNode(selectedNode.id, { ragFilter: f })}
                      />
                    </div>
                  )}
                </>
              )}
              {selectedNode.kind !== 'input' && (
                <div className="space-y-2">
                  <Label>上游步骤</Label>
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {wf.nodes.filter((n) => n.id !== selectedNode.id).map((n) => (
                      <label key={n.id} className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          className="accent-primary"
                          checked={(selectedNode.dependsOn || []).includes(n.id)}
                          onChange={() => toggleDep(selectedNode.id, n.id)}
                        />
                        <span className="truncate">{n.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
