// src/lib/hooks/workbenchGenerate.ts
// 项目工作台「生成流」相关逻辑：rAF 批量步骤更新 + 调用工作流生成并合并流式结果。
// 纯逻辑层，依赖由 useWorkbench 注入；行为与抽离前一致。
import { useRef, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { generateWithWorkflow } from '@/features/projects';
import { useProjectStore } from '@/features/projects';
import type { Step, GenerationContext } from '@/types';
import type { Workflow } from '@/features/workflow';

export interface GenerationDeps {
  projectId: string;
  activeWorkflowId: string;
  activeWorkflow: Workflow | null;
  buildContext: () => GenerationContext;
  summarizePlot: (text: string) => Promise<string | void>;
  depositCharacterProfiles: (text: string) => Promise<void>;
  abortRef: React.MutableRefObject<AbortController | null>;
  pausedRef: React.MutableRefObject<boolean>;
  setSteps: React.Dispatch<React.SetStateAction<Step[]>>;
  setCurrentAgent: React.Dispatch<React.SetStateAction<string | null>>;
  setIsStreaming: React.Dispatch<React.SetStateAction<boolean>>;
  setPlotSummary: React.Dispatch<React.SetStateAction<string>>;
}

export function makeGeneration(d: GenerationDeps) {
  const { projectId, activeWorkflowId, activeWorkflow, buildContext, summarizePlot, depositCharacterProfiles, abortRef,   pausedRef, setSteps, setCurrentAgent, setIsStreaming, setPlotSummary } = d;

  const stepUpdatesRef = useRef<((prev: Step[]) => Step[])[]>([]);
  const pendingAgentRef = useRef<string | null>(null);
  const flushScheduledRef = useRef(false);
  const completedNodeIdsRef = useRef<Set<string>>(new Set());

  const getSortedNodeIds = useCallback(() => {
    if (!activeWorkflow) return [];
    const nodes = activeWorkflow.nodes;
    const inDegree: Record<string, number> = {};
    const graph: Record<string, string[]> = {};
    nodes.forEach((n) => {
      inDegree[n.id] = 0;
      graph[n.id] = [];
    });
    nodes.forEach((n) => {
      (n.dependsOn || []).forEach((dep) => {
        if (graph[dep]) graph[dep].push(n.id);
        inDegree[n.id] = (inDegree[n.id] || 0) + 1;
      });
    });
    const queue = nodes.filter((n) => inDegree[n.id] === 0).map((n) => n.id);
    const sorted: string[] = [];
    while (queue.length) {
      const curr = queue.shift()!;
      sorted.push(curr);
      graph[curr].forEach((next) => {
        inDegree[next]--;
        if (inDegree[next] === 0) queue.push(next);
      });
    }
    return sorted;
  }, [activeWorkflow]);

  const sortedNodeIds = useMemo(() => getSortedNodeIds(), [getSortedNodeIds]);
  const nodeIndexMap = useMemo(() => {
    const m = new Map<string, number>();
    sortedNodeIds.forEach((id, idx) => m.set(id, idx));
    return m;
  }, [sortedNodeIds]);

  const flushStepUpdates = useCallback(() => {
    flushScheduledRef.current = false;
    const updates = stepUpdatesRef.current;
    const agent = pendingAgentRef.current;
    stepUpdatesRef.current = [];
    pendingAgentRef.current = null;
    if (updates.length) {
      setSteps((prev) => updates.reduce<Step[]>((acc, u) => u(acc), prev));
    }
    if (agent) setCurrentAgent(agent);
  }, [setSteps, setCurrentAgent]);

  const enqueueStepUpdate = useCallback(
    (update: (prev: Step[]) => Step[]) => {
      stepUpdatesRef.current.push(update);
      if (!flushScheduledRef.current) {
        flushScheduledRef.current = true;
        Promise.resolve().then(flushStepUpdates);
      }
    },
    [flushStepUpdates],
  );

  const handleGenerate = useCallback(async () => {
    abortRef.current = new AbortController();
    setIsStreaming(true);
    setCurrentAgent(null);
    setSteps([]);
    completedNodeIdsRef.current.clear();
    const firstNode = activeWorkflow?.nodes.find(n => !(n.dependsOn || []).length) || activeWorkflow?.nodes[0];
    if (firstNode) {
      const placeholder: Step = {
        id: `step-${Date.now()}`,
        nodeId: firstNode.id,
        agent: firstNode.id,
        agentName: firstNode.label || '步骤',
        content: '',
        status: 'streaming',
      };
      setSteps([placeholder]);
    }
    try {
      const newSteps = await generateWithWorkflow(projectId, {
        workflowId: activeWorkflowId,
        context: buildContext(),
        runOpts: { simulateDelay: true },
        shouldPause: () => pausedRef.current,
        isAborted: () => !!abortRef.current?.signal.aborted,
        onStep: (step, _label, _output, _systemPrompt, status) => {
          const workflowLabel = activeWorkflow?.nodes.find((n) => n.id === step.nodeId)?.label;
          const resolvedLabel = workflowLabel || step.nodeId || '步骤';
          const enriched: Step = { ...step, agentName: resolvedLabel, agent: step.nodeId || resolvedLabel };
          enqueueStepUpdate((prev) => {
            const idx = enriched.nodeId ? prev.findIndex((s) => s.nodeId === enriched.nodeId) : -1;
            let next: Step[];
            if (idx >= 0) {
              const existing = prev[idx];
              const arr = [...prev];
              const keepStatus = existing.status === 'waiting' ? 'waiting' : (enriched.status || existing.status);
              const content = enriched.content && enriched.content.length > 0 ? enriched.content : existing.content;
              arr[idx] = { ...existing, content, status: keepStatus, nodeId: enriched.nodeId, agentName: resolvedLabel };
              next = arr;
            } else {
              next = [...prev, enriched];
            }
            if (status === 'done' && enriched.nodeId) {
              completedNodeIdsRef.current.add(enriched.nodeId);
              const nodeIdx = nodeIndexMap.get(enriched.nodeId);
              if (nodeIdx !== undefined && nodeIdx + 1 < sortedNodeIds.length) {
                const nextNodeId = sortedNodeIds[nodeIdx + 1];
                if (!next.some((s) => s.nodeId === nextNodeId)) {
                  const nextNode = activeWorkflow?.nodes.find((n) => n.id === nextNodeId);
                  if (nextNode) {
                    const placeholder: Step = {
                      id: `step-${Date.now()}`,
                      nodeId: nextNode.id,
                      agent: nextNode.id,
                      agentName: nextNode.label || '步骤',
                      content: '',
                      status: 'streaming',
                    };
                    next = [...next, placeholder];
                  }
                }
              }
            }
            if (enriched.agent === 'writer' || enriched.nodeId === 'writer') pendingAgentRef.current = 'writer';
            return next;
          });
        },
      });
      toast.success(`已用「${activeWorkflow?.name ?? '创作流水线'}」生成 ${newSteps.length} 个环节`);
      if (newSteps.length) {
        const text = newSteps.map((s) => s.content).join('\n');
        summarizePlot(text).then((s) => s && setPlotSummary(s)).catch(() => {});
        depositCharacterProfiles(text).catch(() => {});
        useProjectStore.getState().saveVersion(projectId, newSteps).catch(() => {});
      }
    } catch (e) {
      toast.error('生成失败', { description: e instanceof Error ? e.message : '未知错误' });
    } finally {
      if (flushScheduledRef.current || stepUpdatesRef.current.length) {
        flushStepUpdates();
      }
      setIsStreaming(false);
      setCurrentAgent(null);
    }
  }, [projectId, activeWorkflowId, activeWorkflow?.name, buildContext, summarizePlot, depositCharacterProfiles, enqueueStepUpdate, setIsStreaming, setCurrentAgent, setSteps, abortRef, pausedRef, setPlotSummary, activeWorkflow, getSortedNodeIds, sortedNodeIds, nodeIndexMap]);

  return { stepUpdatesRef, pendingAgentRef, flushScheduledRef, flushStepUpdates, enqueueStepUpdate, handleGenerate };
}
