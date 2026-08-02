'use client';

import { useEffect, useState, useCallback } from 'react';
import { useBookDetailStore } from '../store';
import { OutlineEditor } from './OutlineEditor';
import * as outlineApi from '@/shared/api/outlines';
import type { OutlineNode } from '@/shared/api/types';

function buildTree(nodes: OutlineNode[]): OutlineNode[] {
  const nodeMap = new Map<number, OutlineNode>();
  const roots: OutlineNode[] = [];
  for (const n of nodes) {
    nodeMap.set(n.id, { ...n, children: [] });
  }
  for (const n of nodeMap.values()) {
    if (n.parentId && nodeMap.has(n.parentId)) {
      const parent = nodeMap.get(n.parentId)!;
      if (!parent.children) parent.children = [];
      parent.children.push(n);
    } else {
      roots.push(n);
    }
  }
  return roots;
}

export function OutlineTab() {
  const bookId = useBookDetailStore((s) => s.bookId);
  const [nodes, setNodes] = useState<OutlineNode[]>([]);

  const loadOutlines = useCallback(async () => {
    try {
      const data = await outlineApi.fetchOutlines(bookId);
      setNodes(buildTree(data));
    } catch { /* silent */ }
  }, [bookId]);

  useEffect(() => { void loadOutlines(); }, [loadOutlines]);

  useEffect(() => {
    const handleRefresh = () => { void loadOutlines(); };
    window.addEventListener('textforge:refresh-outlines', handleRefresh);
    return () => window.removeEventListener('textforge:refresh-outlines', handleRefresh);
  }, [loadOutlines]);

  const handleCreate = useCallback(async (parentId?: number) => {
    try {
      const created = await outlineApi.createOutline(bookId, { title: '新节点', nodeType: 'scene', parentId });
      await loadOutlines();
      return created;
    } catch { return null; }
  }, [bookId, loadOutlines]);

  const handleUpdate = useCallback(async (nodeId: number, patch: { title?: string; content?: string }) => {
    try {
      await outlineApi.updateOutline(bookId, nodeId, patch);
      await loadOutlines();
    } catch { /* silent */ }
  }, [bookId, loadOutlines]);

  const handleDelete = useCallback(async (nodeId: number) => {
    try {
      await outlineApi.deleteOutline(bookId, nodeId);
      await loadOutlines();
    } catch { /* silent */ }
  }, [bookId, loadOutlines]);

  const handleReorder = useCallback(async (nodeId: number, newParentId: number | null, newIndex: number) => {
    try {
      await outlineApi.updateOutline(bookId, nodeId, { parentId: newParentId ?? undefined, sortOrder: newIndex });
      await loadOutlines();
    } catch { /* silent */ }
  }, [bookId, loadOutlines]);

  return (
    <div className="h-full overflow-y-auto pr-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">大纲树</div>
      <OutlineEditor
        nodes={nodes}
        onCreate={handleCreate}
        onUpdate={handleUpdate}
        onDelete={handleDelete}
        onReorder={handleReorder}
      />
    </div>
  );
}
