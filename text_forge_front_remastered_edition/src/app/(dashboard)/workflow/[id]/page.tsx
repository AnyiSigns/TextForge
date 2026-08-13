'use client';

import { useCallback, useEffect, useMemo, useState, useRef, use } from 'react';
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
  type ReactFlowInstance,
  MarkerType,
  BackgroundVariant,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import * as workflowApi from '@/shared/api/workflows';
import type { Workflow, WorkflowNode as WfNode, WorkflowEdge as WfEdge } from '@/shared/api/workflows';
import { RoleNode } from '../components/RoleNode';
import { NodePalette } from '../components/NodePalette';
import { InspectorPanel } from '../components/InspectorPanel';
import { getLayer } from '../executorMeta';

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

// workflow 连线 → ReactFlow 连线（样式集中于此，避免初始化与同步 effect 两处重复定义）
function wfEdgeToFlowEdge(e: WfEdge): Edge {
  return {
    id: `${e.from}->${e.to}`,
    source: e.from,
    target: e.to,
    type: 'smoothstep',
    style: { stroke: 'var(--foreground)', strokeWidth: 1, opacity: 0.25 },
    markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--foreground)', width: 8, height: 8 },
  };
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
  // 记录已整体布局过的工作流 id：仅在该 id 首次加载或变化时执行 layoutNodes（重排坐标），
  // 后续 nodes/edges 数据变化只合并 data，保留用户拖拽坐标（后端不持久化 position）。
  const laidOutIdRef = useRef<string | null>(null);

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

  // 初始节点/连线（含自动布局）用 useMemo 缓存：避免每轮渲染都重算映射与拓扑排布，
  // 其值仅在 useNodesState/useEdgesState 首次挂载时生效，后续同步由下方 effect 负责。
  const initialFlow = useMemo(() => {
    const flowNodes = (workflow.nodes ?? []).map(wfNodeToFlowNode);
    const flowEdges = (workflow.edges ?? []).map(wfEdgeToFlowEdge);
    return { nodes: layoutNodes(flowNodes, flowEdges), edges: flowEdges };
  }, [workflow.nodes, workflow.edges]);

  const [nodes, setNodes, onNodesChange] = useNodesState(initialFlow.nodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialFlow.edges);

  // ReactFlow 实例：onDrop 需用 screenToFlowPosition 把屏幕坐标换算为画布坐标
  const reactFlowInstanceRef = useRef<ReactFlowInstance | null>(null);

  useEffect(() => {
    if (!loadedRef.current) return;
    const flowNodes = (workflow.nodes ?? []).map(wfNodeToFlowNode);
    const flowEdges = (workflow.edges ?? []).map(wfEdgeToFlowEdge);
    if (laidOutIdRef.current !== id) {
      // 首次加载此工作流（或 id 变化）：整体布局并重置坐标为自动排布。
      setNodes(layoutNodes(flowNodes, flowEdges));
      setEdges(flowEdges);
      laidOutIdRef.current = id;
    } else {
      // 后续数据变更：保留节点现有位置与用户拖拽坐标，仅原地更新 data 并同步新增/删除节点。
      setNodes((nds) => {
        const byId = new Map(nds.map((n) => [n.id, n]));
        return flowNodes.map((fn) => {
          const prev = byId.get(fn.id);
          if (prev) return { ...prev, data: fn.data };
          return fn;
        });
      });
      setEdges(flowEdges);
    }
  }, [workflow.nodes, workflow.edges, id, setNodes, setEdges]);

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

  // 画布删除节点（Delete/Backspace 或 API 删除）必须回写 workflow：
  // 否则 handleSave 仍以 workflow 为准会把已删节点重新写回，且后续 updateNode
  // 触发同步 effect 时会把被删节点以 (0,0) 坐标「复活」到画布上。
  const handleNodesDelete = useCallback((deleted: Node[]) => {
    const removed = new Set(deleted.map((n) => n.id));
    if (removed.size === 0) return;
    setWorkflow((w) => ({
      ...w,
      nodes: w.nodes.filter((n) => !removed.has(n.id)),
      // 与画布一致：删除节点时其相连的连线一并移除
      edges: w.edges.filter((e) => !removed.has(e.from) && !removed.has(e.to)),
    }));
    setSelectedNodeId((cur) => (cur && removed.has(cur) ? null : cur));
  }, []);

  // 画布删除连线同样回写 workflow。用 from->to 组合键匹配：
  // onConnect 经 addEdge 生成的边 id 由 ReactFlow 内部生成，与 wfEdgeToFlowEdge 的 id 不同。
  const handleEdgesDelete = useCallback((deleted: Edge[]) => {
    const removed = new Set(deleted.map((e) => `${e.source}->${e.target}`));
    if (removed.size === 0) return;
    setWorkflow((w) => ({
      ...w,
      edges: w.edges.filter((e) => !removed.has(`${e.from}->${e.to}`)),
    }));
  }, []);

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
      // 屏幕坐标 → 画布坐标（考虑画布缩放与平移）；实例未就绪时按侧栏/顶栏偏移兜底
      const instance = reactFlowInstanceRef.current;
      const position = instance
        ? instance.screenToFlowPosition({ x: event.clientX, y: event.clientY })
        : { x: event.clientX - 280, y: event.clientY - 200 };
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
      // 保存以画布（ReactFlow）状态为权威：节点/连线的「存在与否」按画布为准，
      // 节点的业务字段（systemPrompt/contextFields/ragFilter 等）仍取 workflow 中的数据。
      // 这样即便某类删除未回写 workflow，也不会把已删节点/连线重新写回后端。
      const wfNodeById = new Map(workflow.nodes.map((n) => [n.id, n]));
      const payloadNodes: WfNode[] = nodes.map((n) => {
        const prev = wfNodeById.get(n.id);
        if (prev) return prev;
        // 兜底：画布上存在但 workflow 里缺失的节点（理论不会出现），按画布 data 还原最小信息
        const data = n.data as { label?: string; executor?: WfNode['executor'] };
        return { id: n.id, label: data.label || '未命名节点', executor: data.executor || 'main' };
      });
      const payloadEdges: WfEdge[] = edges.map((e) => ({ from: e.source, to: e.target }));
      const saved = await workflowApi.saveWorkflow({
        ...workflow,
        name,
        nodes: payloadNodes,
        edges: payloadEdges,
      });
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
            {(workflow.nodes ?? []).length} 个节点 · {(workflow.edges ?? []).length} 条连线
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
            onNodesDelete={handleNodesDelete}
            onEdgesDelete={handleEdgesDelete}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onInit={(instance) => { reactFlowInstanceRef.current = instance; }}
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
