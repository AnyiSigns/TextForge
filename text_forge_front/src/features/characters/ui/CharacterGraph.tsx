'use client';

import { useMemo } from 'react';
import { Background, BackgroundVariant, Controls, Edge, MarkerType, Node, ReactFlow, useEdgesState, useNodesState } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Character, CharacterRelation } from '@/types';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

interface CharacterGraphProps {
  characters: Character[];
}

function CharacterNode({ data }: { data: { character: Character } }) {
  const character = data.character;
  return (
    <div className="flex flex-col items-center gap-1 p-2 rounded-xl border border-border/60 bg-background/90 shadow-sm">
      <Avatar className="w-10 h-10">
        <AvatarImage src={character.avatarUrl} />
        <AvatarFallback>{character.name.slice(0, 2)}</AvatarFallback>
      </Avatar>
      <span className="text-xs font-medium whitespace-nowrap">{character.name}</span>
      {character.roleType && (
        <Badge variant="secondary" className="text-[10px] px-1 py-0">{character.roleType}</Badge>
      )}
    </div>
  );
}

const nodeTypes = { character: CharacterNode };

export function CharacterGraph({ characters }: CharacterGraphProps) {
  const charMap = useMemo(() => {
    const map = new Map<number, Character>();
    characters.forEach((c) => map.set(c.id, c));
    return map;
  }, [characters]);

  const initialNodes: Node[] = useMemo(
    () =>
      characters.map((c, index) => ({
        id: String(c.id),
        type: 'character',
        position: { x: (index % 6) * 240 + 140, y: Math.floor(index / 6) * 200 + 100 },
        data: { character: c },
      })),
    [characters],
  );

  const initialEdges: Edge[] = useMemo(() => {
    const edges: Edge[] = [];
    characters.forEach((c) => {
      const relations = c.relationshipChain ?? [];
      relations.forEach((rel: CharacterRelation) => {
        const targetId = Number(rel.target);
        if (!charMap.has(targetId)) return;
        edges.push({
          id: `${c.id}-${rel.target}-${rel.id}`,
          source: String(c.id),
          target: String(targetId),
          label: rel.relation,
          labelStyle: { fontSize: 10, fill: 'currentColor' },
          labelShowBg: false,
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
        });
      });
    });
    return edges;
  }, [characters, charMap]);

  const [nodes] = useNodesState(initialNodes);
  const [edges] = useEdgesState(initialEdges);

  return (
    <div className="h-[70vh] w-full rounded-2xl border border-border/60 bg-background/60">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
        defaultEdgeOptions={{ type: 'smoothstep' }}
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="currentColor" />
        <Controls />
      </ReactFlow>
      <div className="absolute top-3 left-3 z-10 flex gap-2">
        <Badge variant="outline" className="text-xs">共 {characters.length} 个角色</Badge>
        <Badge variant="outline" className="text-xs">{edges.length} 条关系</Badge>
      </div>
    </div>
  );
}
