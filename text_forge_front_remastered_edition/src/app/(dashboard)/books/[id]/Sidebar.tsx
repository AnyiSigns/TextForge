'use client';

import { useBookDetailStore } from './store';
import { OutlineTree } from './Sidebar/OutlineTree';
import { CharacterList } from './Sidebar/CharacterList';
import { WorldPanel } from './Sidebar/WorldPanel';

export function Sidebar() {
  const activePanel = useBookDetailStore((s) => s.activePanel);

  return (
    <aside className="ide-sidebar">
      {activePanel === 'outline' && <OutlineTree />}
      {activePanel === 'characters' && <CharacterList />}
      {activePanel === 'world' && <WorldPanel />}
    </aside>
  );
}
