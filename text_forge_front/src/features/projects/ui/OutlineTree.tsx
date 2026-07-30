'use client';

import { useMemo } from 'react';
import { Background, BackgroundVariant, Controls, Edge, MarkerType, Node, ReactFlow, useEdgesState, useNodesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Badge } from '@/components/ui/badge';
import type { OutlineVolume } from '@/lib/storage/backupSchema';

interface OutlineTreeProps {
  volumes: OutlineVolume[];
  onChapterClick?: (volumeId: string, chapterId: string) => void;
}

function VolumeNode({ data }: { data: { volume: OutlineVolume; onClick?: (volumeId: string, chapterId: string) => void } }) {
  const { volume, onClick } = data;
  return (
    <div className="rounded-xl border border-border/60 bg-background/90 p-3 shadow-sm min-w-[180px]">
      <p className="text-sm font-semibold mb-2">{volume.title}</p>
      <div className="space-y-1.5">
        {volume.chapters.map((chap: OutlineVolume['chapters'][number]) => (
          <button
            key={chap.id}
            onClick={() => onClick?.(volume.id, chap.id)}
            className="w-full text-left text-xs rounded-lg border border-border/40 p-2 hover:bg-accent/40 transition-colors"
          >
            <p className="font-medium truncate">{chap.title}</p>
            <div className="flex items-center gap-1 mt-1">
              <Badge variant="outline" className="text-[10px] px-1 py-0">
                {chap.nodes.length} 节点
              </Badge>
              {chap.nodes.some((n) => n.status === 'done') && (
                <Badge variant="secondary" className="text-[10px] px-1 py-0">
                  已完成
                </Badge>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

const nodeTypes = { volume: VolumeNode };

export function OutlineTree({ volumes, onChapterClick }: OutlineTreeProps) {
  const { nodes: initialNodes, edges: initialEdges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    volumes.forEach((vol, vIdx) => {
      nodes.push({
        id: `vol-${vol.id}`,
        type: 'volume',
        position: { x: vIdx * 320 + 40, y: 40 },
        data: { volume: vol, onClick: onChapterClick },
      });
      vol.chapters.forEach((chap, cIdx) => {
        nodes.push({
          id: chap.id,
          type: 'volume',
          position: { x: vIdx * 320 + 40, y: 200 + cIdx * 110 },
          data: { volume: { ...vol, chapters: [chap] }, onClick: onChapterClick },
        });
        edges.push({
          id: `edge-vol-${vol.id}-chap-${chap.id}`,
          source: `vol-${vol.id}`,
          target: chap.id,
          type: 'smoothstep',
          animated: false,
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        });
      });
    });
    return { nodes, edges };
  }, [volumes, onChapterClick]);

  const [nodes] = useNodesState(initialNodes);
  const [edges] = useEdgesState(initialEdges);

  return (
    <div className="h-[70vh] w-full rounded-2xl border border-border/60 bg-background/60 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
        defaultEdgeOptions={{ type: 'smoothstep' }}
        panOnDrag
        zoomOnScroll
        nodesDraggable
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="currentColor" />
        <Controls />
      </ReactFlow>
      <div className="absolute top-3 left-3 z-10">
        <Badge variant="outline" className="text-xs">大纲树状图</Badge>
      </div>
    </div>
  );
}