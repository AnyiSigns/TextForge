'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { List, Network } from 'lucide-react';
import { CharacterCard } from './CharacterCard';
import { CharacterGraph } from './CharacterGraph';
import type { Character } from '@/types';

interface CharacterListProps {
  characters: Character[];
  onDelete: (id: number) => void;
}

export function CharacterList({ characters, onDelete }: CharacterListProps) {
  const [view, setView] = useState<'list' | 'graph'>('list');

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">共 {characters.length} 个角色</p>
        <div className="flex items-center gap-1 rounded-lg border border-border/60 p-0.5">
          <Button
            variant={view === 'list' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-2.5 text-xs gap-1.5"
            onClick={() => setView('list')}
          >
            <List className="w-3.5 h-3.5" /> 列表
          </Button>
          <Button
            variant={view === 'graph' ? 'secondary' : 'ghost'}
            size="sm"
            className="h-7 px-2.5 text-xs gap-1.5"
            onClick={() => setView('graph')}
          >
            <Network className="w-3.5 h-3.5" /> 关系图谱
          </Button>
        </div>
      </div>
      {view === 'list' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {characters.map((c) => (
            <CharacterCard key={c.id} character={c} onDelete={onDelete} />
          ))}
        </div>
      ) : (
        <CharacterGraph characters={characters} />
      )}
    </div>
  );
}
