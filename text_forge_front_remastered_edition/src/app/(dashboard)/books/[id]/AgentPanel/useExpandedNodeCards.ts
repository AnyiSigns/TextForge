'use client';

/**
 * Agent 面板：工作流节点卡片的展开状态管理（从 AgentPanel.tsx 抽离）。
 * 新出现的节点卡片自动展开（对应气泡可见），节点列表清空时复位。
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentNodeStatus } from '../store';

export function useExpandedNodeCards(agentNodeStatuses: AgentNodeStatus[]) {
  const [expandedNodeCards, setExpandedNodeCards] = useState<Set<string>>(new Set());
  const seenNodeIdsRef = useRef<Set<string>>(new Set());
  // 原渲染期 setState 改为 effect + ref（渲染期调整移除）
  const prevStatusLenRef = useRef(agentNodeStatuses.length);

  useEffect(() => {
    if (agentNodeStatuses.length === 0 && prevStatusLenRef.current !== 0) {
      setExpandedNodeCards(new Set());
    }
    prevStatusLenRef.current = agentNodeStatuses.length;
  }, [agentNodeStatuses.length]);

  useEffect(() => {
    if (agentNodeStatuses.length === 0) {
      seenNodeIdsRef.current.clear();
      return;
    }
    const fresh = agentNodeStatuses.filter((n) => !seenNodeIdsRef.current.has(n.nodeId));
    if (fresh.length > 0) {
      fresh.forEach((n) => seenNodeIdsRef.current.add(n.nodeId));
      setExpandedNodeCards((prev) => {
        const next = new Set(prev);
        fresh.forEach((n) => next.add(n.nodeId));
        return next;
      });
    }
  }, [agentNodeStatuses]);

  const toggleNodeCard = useCallback((nodeId: string) => {
    setExpandedNodeCards((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  }, []);

  return { expandedNodeCards, toggleNodeCard };
}
