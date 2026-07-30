// src/features/projects/ui/OutlinePanel.tsx
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ListTodo, Network, Plus } from 'lucide-react';
import { useOutlinePanel } from './useOutlinePanel';
import { OutlineTree } from './OutlineTree';
import { OutlineVolumeItem } from './OutlineVolumeItem';

export function OutlinePanel({ bookId }: { bookId: string }) {
  const { volumes, expanded, newVol, newChap, newNode, view, stats, isLoading, projChars, creativeSettingSections, toggle, setNewVol, setNewChap, setNewNode, setView, handleAddVolume, handleAddChapter, handleAddNode, generateThisChapter, patchVolume, removeVolume, patchChapter, removeChapter, patchNode, removeNode } = useOutlinePanel(bookId);

  if (isLoading) return <div className="h-64 flex items-center justify-center text-xs text-muted-foreground">加载大纲中...</div>;

  return (
    <Card className="glass-card">
      <CardHeader className="flex items-center justify-between gap-3 flex-wrap">
        <CardTitle className="flex items-center gap-2">
          <ListTodo className="w-4 h-4 text-primary" /> 项目大纲
          {stats.total > 0 && (
            <>
              <span className="text-xs font-normal text-muted-foreground">{stats.done}/{stats.total} 章完成</span>
              {stats.total > 0 && view === 'tree' && (
                <div className="w-full sm:w-48 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div className="h-full bg-primary transition-all" style={{ width: `${(stats.done / Math.max(1, stats.total)) * 100}%` }} />
                </div>
              )}
            </>
          )}
        </CardTitle>
        <div className="flex items-center gap-2">
          <div className="flex items-center rounded-lg border border-border/60 p-0.5">
            <Button variant={view === 'tree' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2.5 text-xs gap-1.5" onClick={() => setView('tree')}><ListTodo className="w-3.5 h-3.5" /> 列表</Button>
            <Button variant={view === 'graph' ? 'secondary' : 'ghost'} size="sm" className="h-7 px-2.5 text-xs gap-1.5" onClick={() => setView('graph')}><Network className="w-3.5 h-3.5" /> 图谱</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {view === 'graph' ? (
          <OutlineTree volumes={volumes} />
        ) : (
          <>
            <div className="flex gap-2">
              <Input value={newVol} onChange={(e) => setNewVol(e.target.value)} placeholder="新卷名，如「第一卷·星海」" onKeyDown={(e) => e.key === 'Enter' && handleAddVolume()} />
              <Button size="sm" onClick={handleAddVolume}><Plus className="w-4 h-4" /></Button>
            </div>
            {volumes.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">还没有大纲。先建一卷，再在卷下加「章」，章下加「情节节点」（可设摘要/状态/关联角色）。</p>
            )}
            {volumes.map((vol) => (
              <OutlineVolumeItem
                key={vol.id}
                vol={vol}
                expanded={expanded}
                toggle={toggle}
                newChap={newChap}
                newNode={newNode}
                onNewChapChange={setNewChap}
                onNewNodeChange={setNewNode}
                handleAddChapter={handleAddChapter}
                handleAddNode={handleAddNode}
                patchVolume={patchVolume}
                removeVolume={removeVolume}
                patchChapter={patchChapter}
                removeChapter={removeChapter}
                patchNode={patchNode}
                removeNode={removeNode}
                projChars={projChars}
                creativeSettingSections={creativeSettingSections}
                generateThisChapter={generateThisChapter}
              />
            ))}
          </>
        )}
      </CardContent>
    </Card>
  );
}
