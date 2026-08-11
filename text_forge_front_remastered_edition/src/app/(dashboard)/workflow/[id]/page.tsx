'use client';

import { useCallback, useEffect, useState, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save } from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  ReactFlow,
  addEdge,
  Controls,
  MiniMap,
  Background,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
  MarkerType,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import * as workflowApi from '@/shared/api/workflows';
import type { Workflow, WorkflowNode as WfNode } from '@/shared/api/workflows';
import { RoleNode } from '../components/RoleNode';
import { NodePalette } from '../components/NodePalette';
import { InspectorPanel } from '../components/InspectorPanel';

const nodeTypes = { roleNode: RoleNode };

let nodeCounter = Date.now();

function makeNodeId() {
  return `n${nodeCounter++}-${Math.random().toString(36).slice(2, 6)}`;
}

function wfNodeToFlowNode(n: WfNode): Node {
  return {
    id: n.id,
    type: 'roleNode',
    position: { x: 0, y: 0 },
    data: {
      label: n.label,
      executor: n.executor || 'main',
      layer: getLayer(n.executor || 'main', n.label),
    },
  };
}

function getLayer(executor: string, label: string): 'decision' | 'execution' | 'audit' {
  if (executor === 'audit') return 'audit';
  if (label.includes('策划') || label.includes('分镜')) return 'decision';
  return 'execution';
}

function layoutNodes(nodes: Node[], edges: Edge[]): Node[] {
  if (nodes.length === 0) return nodes;
  if (edges.length === 0) {
    return nodes.map((n, i) => ({
      ...n,
      position: { x: 50, y: i * 90 + 20 },
    }));
  }

  const adj: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};
  for (const n of nodes) {
    adj[n.id] = [];
    inDegree[n.id] = 0;
  }
  for (const e of edges) {
    adj[e.source]?.push(e.target);
    inDegree[e.target] = (inDegree[e.target] || 0) + 1;
  }

  const queue = Object.keys(inDegree).filter((id) => inDegree[id] === 0);
  const levels: string[][] = [];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const level = [...queue];
    levels.push(level);
    queue.length = 0;
    for (const id of level) {
      visited.add(id);
      for (const neighbor of adj[id] || []) {
        if (visited.has(neighbor)) continue;
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) queue.push(neighbor);
      }
    }
  }

  const positioned = new Map<string, { x: number; y: number }>();
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i];
    const startY = 20 + i * 90;
    const totalWidth = level.length * 200;
    const startX = Math.max(50, (800 - totalWidth) / 2);
    level.forEach((id, j) => {
      positioned.set(id, { x: startX + j * 200, y: startY });
    });
  }

  return nodes.map((n) => ({
    ...n,
    position: positioned.get(n.id) || { x: 50, y: 0 },
  }));
}

export default function WorkflowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const isNew = id === 'new';

  const [workflow, setWorkflow] = useState<Workflow>(() => ({
    // 新建页直接生成 id：若初始为空，保存时会发出 PUT /workflows/（无 id）
    // 被后端 405 拒绝（405 的来源）；编辑页 id 由下方 effect 从详情接口回填
    id: isNew ? makeNodeId() : '',
    name: '未命名工作流',
    nodes: [],
    edges: [],
  }));
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const loadedRef = useRef(false);

  useEffect(() => {
    if (isNew) loadedRef.current = true;
  }, [isNew]);

  useEffect(() => {
    if (isNew) return;
    workflowApi.getWorkflow(id).then((wf) => {
      setWorkflow(wf);
      if (wf.nodes?.[0]) setSelectedNodeId(wf.nodes[0].id);
      loadedRef.current = true;
    }).catch(() => {});
  }, [id, isNew]);

  const initialNodes = workflow.nodes.map(wfNodeToFlowNode);
  const initialEdges = workflow.edges.map((e) => ({
    id: `${e.from}->${e.to}`,
    source: e.from,
    target: e.to,
    type: 'smoothstep',
    style: { stroke: 'var(--foreground)', strokeWidth: 1, opacity: 0.25 },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--foreground)', width: 8, height: 8 },
  }));

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutNodes(initialNodes, initialEdges));
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  useEffect(() => {
    if (!loadedRef.current) return;
    const flowNodes = workflow.nodes.map(wfNodeToFlowNode);
    const flowEdges = workflow.edges.map((e) => ({
      id: `${e.from}->${e.to}`,
      source: e.from,
      target: e.to,
      type: 'smoothstep',
      style: { stroke: 'var(--foreground)', strokeWidth: 1, opacity: 0.25 },
      markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--foreground)', width: 8, height: 8 },
    }));
    setNodes(layoutNodes(flowNodes, flowEdges));
    setEdges(flowEdges);
  }, [workflow.nodes, workflow.edges, setNodes, setEdges]);

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => addEdge(connection, eds) as typeof eds);
      setWorkflow((w) => ({
        ...w,
        edges: [...w.edges, { from: connection.source!, to: connection.target! }],
      }));
    },
    [setEdges],
  );

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: Node) => {
      setSelectedNodeId(node.id);
    },
    [],
  );

  const handleDragStart = useCallback(
    (event: React.DragEvent, template: {
      id: string; label: string; executor: string; systemPrompt: string; contextFields: string[];
    }) => {
      event.dataTransfer.setData('application/json', JSON.stringify(template));
      event.dataTransfer.effectAllowed = 'move';
    },
    [],
  );

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      const dataStr = event.dataTransfer.getData('application/json');
      if (!dataStr) return;
      const template = JSON.parse(dataStr);
      const nodeId = makeNodeId();
      const newNode: WfNode = {
        id: nodeId,
        label: template.label,
        executor: template.executor,
        systemPrompt: template.systemPrompt,
        contextFields: template.contextFields,
      };
      const position = { x: event.clientX - 280, y: event.clientY - 200 };
      const flowNode: Node = {
        id: nodeId,
        type: 'roleNode',
        position,
        data: {
          label: template.label,
          executor: template.executor,
          layer: getLayer(template.executor, template.label),
        },
      };
      setNodes((nds) => [...nds, flowNode]);
      setWorkflow((w) => ({ ...w, nodes: [...w.nodes, newNode] }));
      setSelectedNodeId(nodeId);
    },
    [setNodes],
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const selectedNode = workflow.nodes.find((n) => n.id === selectedNodeId) ?? null;

  const updateNode = (nodeId: string, patch: Partial<WfNode>) => {
    setWorkflow((w) => ({
      ...w,
      nodes: w.nodes.map((n) => (n.id === nodeId ? { ...n, ...patch } : n)),
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const name = workflow.name.trim() || '未命名工作流';
      const saved = await workflowApi.saveWorkflow({ ...workflow, name });
      // 内置模板（workflows 表 builtin=true）不可原地修改：后端 put_workflow
      // 会另存为用户副本并返回新 id，此处需跳转到副本并提示，否则 URL 与状态脱节。
      const copied = saved.id !== workflow.id;
      setWorkflow(saved);
      if (isNew || copied) router.replace(`/workflow/${saved.id}`);
      toast.success(copied ? '内置模板已另存为副本' : '已保存');
    } catch { toast.error('保存失败'); }
    finally { setSaving(false); }
  };

  return (
    <div className="flex flex-col h-full bg-card glass-exempt">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0 bg-background">
        <div className="flex items-center gap-3">
          <Link href="/workflow" className="text-foreground/30 hover:text-foreground/60">
            <ArrowLeft size={16} />
          </Link>
          <input
            value={workflow.name}
            onChange={(e) => setWorkflow((w) => ({ ...w, name: e.target.value }))}
            className="text-sm font-medium bg-transparent border-none outline-none min-w-[150px] text-foreground"
            placeholder="工作流名称"
          />
          {workflow.builtin && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-foreground/[0.06] border border-border text-foreground/50 shrink-0">
              内置模板（保存将另存为副本）
            </span>
          )}
          <span className="text-[10px] text-foreground/25">
            {workflow.nodes.length} 个节点 · {workflow.edges.length} 条连线
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-1 h-7 px-3 rounded-md bg-foreground text-background text-xs font-medium border-none cursor-pointer hover:opacity-90 disabled:opacity-50"
          >
            <Save size={12} /> {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <NodePalette onDragStart={handleDragStart} />

        <div className="flex-1 relative" onDrop={handleDrop} onDragOver={handleDragOver}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.3 }}
            className="bg-card"
            style={{ background: 'var(--card)' }}
            defaultEdgeOptions={{
              type: 'smoothstep',
              style: { stroke: 'var(--foreground)', strokeWidth: 1, opacity: 0.25 },
              markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--foreground)', width: 8, height: 8 },
            }}
          >
            <Controls
              className="!bg-background !border-border !rounded-lg !shadow-sm [&>button]:!bg-background [&>button]:!border-border [&>button]:!text-foreground/40"
            />
            <MiniMap
              nodeColor="var(--foreground)"
              maskColor="color-mix(in srgb, var(--foreground) 4%, transparent)"
              className="!bg-background !border-border !rounded-lg !shadow-sm"
            />
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--foreground)" style={{ opacity: 0.04 }} />
          </ReactFlow>
        </div>

        <InspectorPanel
          node={selectedNode}
          onChange={(patch: Partial<WfNode>) => selectedNode && updateNode(selectedNode.id, patch)}
          onClose={() => setSelectedNodeId(null)}
        />
      </div>
    </div>
  );
}
