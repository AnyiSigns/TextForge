'use client';

import { useEffect, use, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Plus, GripVertical, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/cn';
import * as workflowApi from '@/shared/api/workflows';
import type { Workflow, WorkflowNode } from '@/shared/api/workflows';

function generateId() { return `node-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`; }

export default function WorkflowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const isNew = id === 'new';

  const [workflow, setWorkflow] = useState<Workflow>({
    id: '', name: '未命名工作流', nodes: [], edges: [],
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isNew) {
      workflowApi.getWorkflow(id).then((wf) => { setWorkflow(wf); if (wf.nodes?.[0]) setSelectedNodeId(wf.nodes[0].id); }).catch(() => {});
    } else {
      setWorkflow({ id: generateId(), name: '未命名工作流', nodes: [], edges: [] });
    }
  }, [id, isNew]);

  const selectedNode = workflow.nodes.find((n) => n.id === selectedNodeId) ?? null;

  const addNode = () => {
    const newNode: WorkflowNode = { id: generateId(), label: '新角色节点' };
    setWorkflow((w) => ({ ...w, nodes: [...w.nodes, newNode] }));
    setSelectedNodeId(newNode.id);
  };

  const updateNode = (nodeId: string, patch: Partial<WorkflowNode>) => {
    setWorkflow((w) => ({
      ...w,
      nodes: w.nodes.map((n) => n.id === nodeId ? { ...n, ...patch } : n),
    }));
  };

  const removeNode = (nodeId: string) => {
    setWorkflow((w) => ({
      ...w,
      nodes: w.nodes.filter((n) => n.id !== nodeId),
      edges: w.edges.filter((e) => e.from !== nodeId && e.to !== nodeId),
    }));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
  };

  const moveNode = (fromIndex: number, toIndex: number) => {
    setWorkflow((w) => {
      const nodes = [...w.nodes];
      const [moved] = nodes.splice(fromIndex, 1);
      nodes.splice(toIndex, 0, moved);
      return { ...w, nodes };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const name = workflow.name.trim() || '未命名工作流';
      const saved = await workflowApi.saveWorkflow({ ...workflow, name });
      setWorkflow(saved);
      if (isNew) router.replace(`/workflow/${saved.id}`);
      toast.success('已保存');
    } catch { toast.error('保存失败'); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/workflow" className="text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /></Link>
          <input
            value={workflow.name}
            onChange={(e) => setWorkflow((w) => ({ ...w, name: e.target.value }))}
            className="text-sm font-medium bg-transparent border-none outline-none min-w-[150px]"
            placeholder="工作流名称"
          />
          <span className="text-[10px] text-muted-foreground">{workflow.nodes.length} 个节点</span>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1 h-7 px-3 rounded-md bg-foreground text-background text-xs font-medium border-none cursor-pointer hover:opacity-90 disabled:opacity-50">
          <Save size={12} /> {saving ? '保存中...' : '保存'}
        </button>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-[180px] shrink-0 border-r border-border p-3 space-y-2">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">添加节点</div>
          <button onClick={addNode}
            className="flex items-center gap-1.5 w-full px-3 py-1.5 rounded-md text-xs bg-transparent border border-dashed border-border hover:border-foreground/20 hover:bg-muted cursor-pointer">
            <Plus size={12} /> 新建角色节点
          </button>
          <div className="text-[10px] text-muted-foreground/60 pt-2">
            角色节点代表工作流中的一个创作角色，每个节点包含独立的系统提示词和配置
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">节点编排</div>
          {workflow.nodes.map((node, i) => (
            <div key={node.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { const from = parseInt(e.dataTransfer.getData('text/plain'), 10); if (!isNaN(from)) moveNode(from, i); }}
              onClick={() => setSelectedNodeId(node.id)}
              className={cn(
                'flex items-center gap-2 p-2.5 rounded-lg border cursor-pointer transition-colors group',
                selectedNodeId === node.id ? 'border-foreground/30 bg-foreground/5' : 'border-border/40 bg-card hover:bg-card/60',
              )}
            >
              <GripVertical size={12} className="text-muted-foreground/30 shrink-0 opacity-0 group-hover:opacity-100 cursor-grab" />
              <div className="w-7 h-7 rounded-md bg-muted flex items-center justify-center text-[10px] font-semibold shrink-0">
                {node.label?.charAt(0) || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{node.label || '未命名'}</div>
                <div className="text-[10px] text-muted-foreground truncate">
                  {node.executor || 'auto'} · {node.systemPrompt ? '已设提示词' : '无提示词'}
                </div>
              </div>
              <button onClick={(e) => { e.stopPropagation(); removeNode(node.id); }}
                className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100">
                <Trash2 size={12} /></button>
            </div>
          ))}
          {workflow.nodes.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-8">点击左侧"新建角色节点"添加第一个节点</div>
          )}
        </div>

        <div className="w-[300px] shrink-0 border-l border-border p-4 space-y-4 overflow-y-auto">
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">节点属性</div>
          {selectedNode ? (
            <>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">名称</label>
                <input
                  value={selectedNode.label}
                  onChange={(e) => updateNode(selectedNode.id, { label: e.target.value })}
                  className="w-full h-8 px-2 rounded-md text-xs bg-background border border-border focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">系统提示词</label>
                <textarea
                  value={selectedNode.systemPrompt || ''}
                  onChange={(e) => updateNode(selectedNode.id, { systemPrompt: e.target.value })}
                  placeholder="定义该角色节点的写作风格、视角、时态、节奏等要求..."
                  className="w-full h-32 px-2 py-1 rounded-md text-xs bg-background border border-border focus:outline-none resize-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">执行器</label>
                <select
                  value={selectedNode.executor || 'auto'}
                  onChange={(e) => updateNode(selectedNode.id, { executor: e.target.value as WorkflowNode['executor'] })}
                  className="w-full h-8 px-2 rounded-md text-xs bg-background border border-border focus:outline-none"
                >
                  <option value="auto">自动选择</option>
                  <option value="main">主生成模型</option>
                  <option value="audit">审核模型</option>
                  <option value="tool">工具模型</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">精度档位</label>
                <select
                  value={selectedNode.tier || 'standard'}
                  onChange={(e) => updateNode(selectedNode.id, { tier: e.target.value as WorkflowNode['tier'] })}
                  className="w-full h-8 px-2 rounded-md text-xs bg-background border border-border focus:outline-none"
                >
                  <option value="standard">标准</option>
                  <option value="cheap">轻量</option>
                </select>
              </div>
              <div>
                <label className="text-[11px] text-muted-foreground block mb-1">RAG 检索条数</label>
                <input
                  type="number"
                  min={1} max={10}
                  value={selectedNode.ragTopK || 3}
                  onChange={(e) => updateNode(selectedNode.id, { ragTopK: parseInt(e.target.value, 10) || 3 })}
                  className="w-full h-8 px-2 rounded-md text-xs bg-background border border-border focus:outline-none"
                />
              </div>
            </>
          ) : (
            <div className="text-xs text-muted-foreground text-center py-8">选择一个节点编辑属性</div>
          )}
        </div>
      </div>
    </div>
  );
}
