'use client';

import { useCallback, useEffect, useState, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Save, Play } from 'lucide-react';
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
import * as booksApi from '@/shared/api/books';
import type { Workflow, WorkflowNode as WfNode } from '@/shared/api/workflows';
import type { Book } from '@/shared/api/types';
import { RoleNode } from '../components/RoleNode';
import { NodePalette } from '../components/NodePalette';
import { InspectorPanel } from '../components/InspectorPanel';
import { ExecutionPanel } from '../components/ExecutionPanel';

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

  const [workflow, setWorkflow] = useState<Workflow>({
    id: '', name: '未命名工作流', nodes: [], edges: [],
  });
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [showExecution, setShowExecution] = useState(false);
  // 执行工作流的书籍：优先从 URL ?book_id= 读取（详情页"提交到工作流"跳转带入），
  // 用户也可在页面内手动选择。ExecutionPanel 依赖它启用"运行"。
  const [activeBookId, setActiveBookId] = useState<number | null>(() => {
    if (typeof window === 'undefined') return null;
    const v = new URLSearchParams(window.location.search).get('book_id');
    return v ? Number(v) : null;
  });
  const [bookOptions, setBookOptions] = useState<Book[]>([]);

  const loadedRef = useRef(false);

  useEffect(() => {
    // 拉取书籍列表用于执行时选择目标书籍
    booksApi.fetchBooks().then((list) => setBookOptions(list)).catch(() => {});
  }, []);

  // 新建工作流时立即建立空文档（渲染期间调整，React 会立即重渲染）
  const [prevIsNew, setPrevIsNew] = useState(isNew);
  if (isNew && !prevIsNew) {
    setPrevIsNew(true);
    setWorkflow({ id: makeNodeId(), name: '未命名工作流', nodes: [], edges: [] });
  }

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
      setWorkflow(saved);
      if (isNew) router.replace(`/workflow/${saved.id}`);
      toast.success('已保存');
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
          <span className="text-[10px] text-foreground/25">
            {workflow.nodes.length} 个节点 · {workflow.edges.length} 条连线
          </span>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={activeBookId ?? ''}
            onChange={(e) => setActiveBookId(e.target.value ? Number(e.target.value) : null)}
            className="h-7 px-2 rounded-md text-[11px] bg-background border border-border text-foreground focus:outline-none cursor-pointer"
            title="选择执行目标书籍"
          >
            <option value="">选择目标书籍...</option>
            {bookOptions.map((b) => (
              <option key={b.id} value={b.id}>{b.title}</option>
            ))}
          </select>
          <button
            onClick={() => setShowExecution((v) => !v)}
            className="flex items-center gap-1 h-7 px-3 rounded-md text-xs font-medium border border-border bg-background text-foreground cursor-pointer hover:bg-foreground/[0.02]"
          >
            <Play size={12} /> 运行
          </button>
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

      {showExecution && (
        <ExecutionPanel
          workflow={workflow}
          bookId={activeBookId ?? undefined}
          onClose={() => setShowExecution(false)}
        />
      )}
    </div>
  );
}
