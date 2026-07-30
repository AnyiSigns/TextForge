// src/features/projects/ui/OutlineVolumeItem.tsx
'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ChevronDown, Plus, Trash2, BookOpen, CheckCircle2, PenLine } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OutlineNodeStatus } from '@/lib/storage/backupSchema';
import type { OutlineVolume, OutlineChapter, OutlineNode } from '@/lib/storage/backupSchema';

const STATUS_META: Record<OutlineNodeStatus, { label: string; cls: string; icon: typeof PenLine }> = {
  writing: { label: '写', cls: 'text-amber-500', icon: PenLine },
  done: { label: '完', cls: 'text-green-500', icon: CheckCircle2 },
};

interface OutlineVolumeItemProps {
  vol: OutlineVolume;
  expanded: Record<string, boolean>;
  toggle: (id: string) => void;
  newChap: Record<string, string>;
  newNode: Record<string, string>;
  onNewChapChange: (updater: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  onNewNodeChange: (updater: Record<string, string> | ((prev: Record<string, string>) => Record<string, string>)) => void;
  handleAddChapter: (volId: string) => Promise<void>;
  handleAddNode: (chId: string) => Promise<void>;
  patchVolume: (id: string, patch: Partial<OutlineVolume>) => void;
  removeVolume: (id: string) => Promise<void>;
  patchChapter: (volId: string, chId: string, patch: Partial<OutlineChapter>) => void;
  removeChapter: (volId: string, chId: string) => Promise<void>;
  patchNode: (volId: string, chId: string, nodeId: string, patch: Partial<OutlineNode>) => void;
  removeNode: (volId: string, chId: string, nodeId: string) => Promise<void>;
  projChars: { id: number; name: string; description: string; bookId: number | null }[];
  creativeSettingSections: { id: string; title: string }[];
  generateThisChapter: (volTitle: string, chap: OutlineVolume['chapters'][number]) => void;
}

export function OutlineVolumeItem({
  vol, expanded, toggle, newChap, newNode, onNewChapChange, onNewNodeChange,
  handleAddChapter, handleAddNode, patchVolume, removeVolume, patchChapter, removeChapter,
  patchNode, removeNode, projChars, creativeSettingSections, generateThisChapter,
}: OutlineVolumeItemProps) {
  return (
    <div className="rounded-xl border border-border/40">
      <div className="flex items-center gap-2 p-3">
        <button onClick={() => toggle(`v-${vol.id}`)} className="text-muted-foreground hover:text-foreground">
          <ChevronDown className={cn('w-4 h-4 transition-transform', expanded[`v-${vol.id}`] && 'rotate-180')} />
        </button>
        <Input value={vol.title} onChange={(e) => patchVolume(vol.id, { title: e.target.value })} className="font-medium border-none p-0 h-auto text-sm flex-1" />
        <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => removeVolume(vol.id)}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </div>
      {(expanded[`v-${vol.id}`] ?? true) && (
        <div className="px-3 pb-3 space-y-3">
          {vol.chapters.map((chap) => (
            <div key={chap.id} className="rounded-lg border border-border/30 bg-background/30">
              <div className="flex items-center gap-2 p-2.5">
                <button onClick={() => toggle(`c-${chap.id}`)} className="text-muted-foreground hover:text-foreground">
                  <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', expanded[`c-${chap.id}`] && 'rotate-180')} />
                </button>
                <Input value={chap.title} onChange={(e) => patchChapter(vol.id, chap.id, { title: e.target.value })} className="font-medium border-none p-0 h-auto text-sm flex-1" />
                <Button variant="ghost" size="sm" className="text-xs text-primary" onClick={() => generateThisChapter(vol.title, chap)}>
                  <BookOpen className="w-3.5 h-3.5 mr-1" /> 生成此章
                </Button>
                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => removeChapter(vol.id, chap.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
              {(expanded[`c-${chap.id}`] ?? true) && (
                <div className="px-2.5 pb-2.5 space-y-2">
                  {chap.nodes.map((node) => {
                    const st = STATUS_META[node.status ?? 'writing'];
                    const StIcon = st.icon;
                    return (
                      <div key={node.id} className="rounded-lg border border-border/30 p-2.5 space-y-2">
                        <div className="flex items-center gap-2">
                          <StIcon className={cn('w-3.5 h-3.5 shrink-0', st.cls)} />
                          <Input value={node.title} onChange={(e) => patchNode(vol.id, chap.id, node.id, { title: e.target.value })} className="font-medium border-none p-0 h-auto text-sm flex-1" />
                          <div className="flex gap-0.5">
                            {(['writing', 'done'] as OutlineNodeStatus[]).map((s) => (
                              <button key={s} onClick={() => patchNode(vol.id, chap.id, node.id, { status: s })} title={STATUS_META[s].label} className={cn('w-5 h-5 rounded-full grid place-items-center text-[9px] border', (node.status ?? 'writing') === s ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground')}>{STATUS_META[s].label[0]}</button>
                            ))}
                          </div>
                          <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => removeNode(vol.id, chap.id, node.id)}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                        <Textarea value={node.content ?? ''} onChange={(e) => patchNode(vol.id, chap.id, node.id, { content: e.target.value })} placeholder="情节摘要（可选）" rows={2} className="text-xs resize-none" />
                        <div className="flex items-center gap-2 flex-wrap">
                          <div className="flex flex-wrap gap-1">
                            {projChars.map((c) => {
                              const on = node.charIds?.includes(String(c.id));
                              return (
                                <button key={c.id} onClick={() => { const set = new Set(node.charIds ?? []); if (on) set.delete(String(c.id)); else set.add(String(c.id)); patchNode(vol.id, chap.id, node.id, { charIds: [...set] }); }} className={cn('px-1.5 py-0.5 rounded-full text-[10px] border', on ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground')}>{c.name}</button>
                              );
                            })}
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {creativeSettingSections.map((sec) => {
                              const on = node.sectionIds?.includes(sec.id);
                              return (
                                <button key={sec.id} onClick={() => { const set = new Set(node.sectionIds ?? []); if (on) set.delete(sec.id); else set.add(sec.id); patchNode(vol.id, chap.id, node.id, { sectionIds: [...set] }); }} className={cn('px-1.5 py-0.5 rounded-full text-[10px] border', on ? 'bg-primary/10 text-primary border-primary/40' : 'border-border text-muted-foreground')}>{sec.title}</button>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex gap-2">
                    <Input value={newNode[chap.id] ?? ''} onChange={(e) => onNewNodeChange((m) => ({ ...m, [chap.id]: e.target.value }))} placeholder="新情节节点" onKeyDown={(e) => e.key === 'Enter' && handleAddNode(chap.id)} className="text-xs" />
                    <Button size="sm" variant="outline" className="h-7" onClick={() => handleAddNode(chap.id)}>
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
          <div className="flex gap-2 pl-6">
            <Input value={newChap[vol.id] ?? ''} onChange={(e) => onNewChapChange((m) => ({ ...m, [vol.id]: e.target.value }))} placeholder="新章名，如「第一章·星海初现」" onKeyDown={(e) => e.key === 'Enter' && handleAddChapter(vol.id)} className="text-xs" />
            <Button size="sm" variant="outline" className="h-7" onClick={() => handleAddChapter(vol.id)}>
              <Plus className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
