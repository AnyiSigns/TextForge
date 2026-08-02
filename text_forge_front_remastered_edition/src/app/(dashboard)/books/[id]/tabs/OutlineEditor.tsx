'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import { ChevronRight, Plus, Pencil, Trash2, GripVertical } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import type { OutlineNode } from '@/shared/api/types';

const NODE_TYPE_LABELS: Record<string, string> = {
  arc: '故事线',
  volume: '卷',
  chapter: '章',
  scene: '场景',
  beat: '节拍',
};

interface OutlineEditorProps {
  nodes: OutlineNode[];
  onCreate: (parentId?: number) => Promise<OutlineNode | null>;
  onUpdate: (nodeId: number, patch: { title?: string; content?: string; parentId?: number; sortOrder?: number }) => Promise<void>;
  onDelete: (nodeId: number) => Promise<void>;
  onReorder: (nodeId: number, newParentId: number | null, newIndex: number) => Promise<void>;
}

type DropPosition = 'before' | 'after' | 'inside' | null;

function TreeNode({
  node,
  depth,
  index,
  siblings,
  onCreate,
  onUpdate,
  onDelete,
  onReorder,
}: {
  node: OutlineNode;
  depth: number;
  index: number;
  siblings: OutlineNode[];
  onCreate: (parentId?: number) => Promise<OutlineNode | null>;
  onUpdate: (nodeId: number, patch: { title?: string; content?: string; parentId?: number; sortOrder?: number }) => Promise<void>;
  onDelete: (nodeId: number) => Promise<void>;
  onReorder: (nodeId: number, newParentId: number | null, newIndex: number) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(node.title);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [dropPos, setDropPos] = useState<DropPosition>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const nodeRef = useRef<HTMLDivElement>(null);

  const handleDoubleClick = () => {
    setEditTitle(node.title);
    setEditing(true);
    setContextMenu(null);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSaveEdit = () => {
    if (editTitle.trim() && editTitle !== node.title) {
      void onUpdate(node.id, { title: editTitle.trim() });
    }
    setEditing(false);
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const closeContextMenu = () => setContextMenu(null);

  const handleDragStart = (e: React.DragEvent) => {
    e.dataTransfer.setData('text/plain', String(node.id));
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOver(true);
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = e.clientY - rect.top;
    const h = rect.height;
    if (y < h * 0.25) setDropPos('before');
    else if (y > h * 0.75) setDropPos('after');
    else setDropPos('inside');
  };

  const handleDragLeave = () => {
    setDragOver(false);
    setDropPos(null);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    setDropPos(null);
    const draggedId = parseInt(e.dataTransfer.getData('text/plain'), 10);
    if (draggedId === node.id) return;

    if (dropPos === 'inside') {
      void onReorder(draggedId, node.id, 0);
    } else if (dropPos === 'before') {
      void onReorder(draggedId, node.parentId ?? null, index);
    } else if (dropPos === 'after') {
      void onReorder(draggedId, node.parentId ?? null, index + 1);
    }
  };

  const typeLabel = NODE_TYPE_LABELS[node.nodeType] || node.nodeType;

  return (
    <div>
      <div
        ref={nodeRef}
        draggable
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={(e) => { e.stopPropagation(); if (node.children?.length) setExpanded(!expanded); }}
        onDoubleClick={handleDoubleClick}
        onContextMenu={handleContextMenu}
        className={cn(
          'flex items-center gap-1 py-1 pl-[var(--depth)] pr-2 group rounded cursor-pointer text-[13px] border-l-2',
          dragOver && dropPos === 'before' && 'border-l-foreground/40',
          dragOver && dropPos === 'inside' && 'bg-[var(--sidebar-hover)]',
          depth === 0 && 'font-medium',
          !dragOver && 'border-l-transparent',
        )}
        style={{ '--depth': `${depth * 16 + 4}px` } as React.CSSProperties}
        role="button"
        tabIndex={0}
      >
        <GripVertical size={10} className="text-muted-foreground/30 shrink-0 opacity-0 group-hover:opacity-100 cursor-grab" />
        {node.children && node.children.length > 0 ? (
          <ChevronRight size={12} className={cn('text-muted-foreground shrink-0 transition-transform', expanded && 'rotate-90')} />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        {editing ? (
          <input
            ref={inputRef}
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            onBlur={handleSaveEdit}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSaveEdit(); if (e.key === 'Escape') setEditing(false); }}
            className="flex-1 h-5 px-1 text-xs bg-background border border-border rounded focus:outline-none min-w-0"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex-1 truncate">{node.title}</span>
        )}
        <span className="text-[10px] text-muted-foreground bg-muted px-1 rounded shrink-0">{typeLabel}</span>
        {node.targetVolumeId && <span className="text-[10px] text-muted-foreground shrink-0">V{node.targetVolumeId}</span>}
        {node.targetChapterId && <span className="text-[10px] text-muted-foreground shrink-0">CH{node.targetChapterId}</span>}
      </div>

      <div className={cn(dragOver && dropPos === 'after' && 'border-l-2 border-foreground/40 ml-[var(--depth)]', !dragOver && 'border-l-transparent')}
        style={{ '--depth': `${depth * 16 + 4}px` } as React.CSSProperties}>
        {expanded && node.children?.map((child, i) => (
          <TreeNode
            key={child.id}
            node={child}
            depth={depth + 1}
            index={i}
            siblings={node.children!}
            onCreate={onCreate}
            onUpdate={onUpdate}
            onDelete={onDelete}
            onReorder={onReorder}
          />
        ))}
      </div>

      {contextMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={closeContextMenu} />
          <div
            className="fixed z-50 bg-popover border border-border rounded-lg shadow-lg py-1 min-w-[140px] text-[13px]"
            style={{ left: contextMenu.x, top: contextMenu.y }}
          >
            <button onClick={() => { closeContextMenu(); void onCreate(node.id); }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-[var(--sidebar-hover)] bg-transparent border-none cursor-pointer">
              <Plus size={12} /> 新建子节点
            </button>
            <button onClick={() => { closeContextMenu(); void onCreate(node.parentId || undefined); }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-[var(--sidebar-hover)] bg-transparent border-none cursor-pointer">
              <Plus size={12} /> 新建同级节点
            </button>
            <button onClick={() => { closeContextMenu(); handleDoubleClick(); }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-[var(--sidebar-hover)] bg-transparent border-none cursor-pointer">
              <Pencil size={12} /> 重命名
            </button>
            <div className="h-px bg-border my-1" />
            <button onClick={() => { closeContextMenu(); void onDelete(node.id); }}
              className="flex items-center gap-2 w-full px-3 py-1.5 text-left hover:bg-destructive/10 text-destructive bg-transparent border-none cursor-pointer">
              <Trash2 size={12} /> 删除
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function OutlineEditor({ nodes, onCreate, onUpdate, onDelete, onReorder }: OutlineEditorProps) {
  const flatNodes = useMemo(() => {
    const result: OutlineNode[] = [];
    const walk = (list: OutlineNode[]) => {
      for (const n of list) {
        result.push(n);
        if (n.children) walk(n.children);
      }
    };
    walk(nodes);
    return result;
  }, [nodes]);

  return (
    <div className="space-y-0.5 select-none">
      <button
        onClick={() => void onCreate()}
        className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground px-2 py-1 rounded bg-transparent border border-dashed border-border cursor-pointer w-full"
      >
        <Plus size={12} /> 新建根节点
      </button>
      {nodes.length === 0 && (
        <div className="text-xs text-muted-foreground p-3 text-center">暂无大纲节点。右键或拖拽以管理大纲结构</div>
      )}
      {nodes.map((node, i) => (
        <TreeNode
          key={node.id}
          node={node}
          depth={0}
          index={i}
          siblings={nodes}
          onCreate={onCreate}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onReorder={onReorder}
        />
      ))}
    </div>
  );
}
