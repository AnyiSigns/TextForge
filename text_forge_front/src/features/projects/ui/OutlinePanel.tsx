// src/components/projects/OutlinePanel.tsx
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ListTodo, ChevronDown, Plus, Trash2, BookOpen, CheckCircle2, PenLine, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OutlineChapter, OutlineNode, OutlineNodeStatus } from '@/lib/storage/backupSchema';
import { dispatchInsertStep } from '@/lib/events/projectEvents';
import { useCharacterStore } from '@/features/characters';
import { useCreativeSettingStore } from '@/features/projects';
import { useOutline } from '@/features/projects';
import { toast } from 'sonner';

const STATUS_META: Record<OutlineNodeStatus, { label: string; cls: string; icon: typeof Circle }> = {
  writing: { label: '写', cls: 'text-amber-500', icon: PenLine },
  done: { label: '完', cls: 'text-green-500', icon: CheckCircle2 },
};

export function OutlinePanel({ bookId }: { bookId: string }) {
  const { volumes, reload, addVolume, addChapter, patchVolume, patchChapter, patchNode, patchChapterNodes, removeVolume, removeChapter, removeNode } = useOutline({ bookId: Number(bookId) });
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [newVol, setNewVol] = useState('');
  const [newChap, setNewChap] = useState<Record<string, string>>({});
  const [newNode, setNewNode] = useState<Record<string, string>>({});
  const didHydrate = useRef(false);

  const characters = useCharacterStore((s) => s.characters);
  const creativeSetting = useCreativeSettingStore((s) => s.settings[Number(bookId)]);
  const creativeSettingSections = creativeSetting?.customDimensions ?? [];
  const projChars = useMemo(
    () => characters.filter((c) => (c.bookId ?? null) === Number(bookId)),
    [characters, bookId],
  );

  useEffect(() => {
    let active = true;
    (async () => {
      await reload();
      if (!active) return;
      didHydrate.current = true;
    })();
    return () => { active = false; };
  }, [bookId, reload]);

  // 种子生成写回大纲后，被动刷新
  useEffect(() => {
    const onSeeded = (e: Event) => {
      const detail = (e as CustomEvent<{ bookId: string }>).detail;
      if (detail?.bookId !== bookId) return;
      void reload();
    };
    window.addEventListener('outline-seeded', onSeeded);
    return () => window.removeEventListener('outline-seeded', onSeeded);
  }, [bookId, reload]);

  const stats = useMemo(() => {
    const arr = Array.isArray(volumes) ? volumes : [];
    const chapters = arr.reduce<OutlineChapter[]>((acc, v) => acc.concat(Array.isArray(v.chapters) ? v.chapters : []), []);
    const nodes = chapters.reduce<OutlineNode[]>((acc, c) => acc.concat(Array.isArray(c.nodes) ? c.nodes : []), []);
    if (!Array.isArray(volumes)) {
      console.error('[OutlinePanel] volumes is not array', volumes);
    }
    return { total: nodes.length, done: nodes.filter((n) => n.status === 'done').length, writing: nodes.filter((n) => n.status === 'writing').length };
  }, [volumes]);

  // ---- 卷 ----
  const handleAddVolume = async () => {
    if (!newVol.trim()) return;
    await addVolume(newVol.trim());
    setNewVol('');
  };

  // ---- 章 ----
  const handleAddChapter = async (volId: string) => {
    const title = newChap[volId]?.trim();
    if (!title) return;
    await addChapter(volId, title);
    setNewChap((m) => ({ ...m, [volId]: '' }));
  };

  // ---- 节点 ----
  const handleAddNode = async (chId: string) => {
    const title = newNode[chId]?.trim();
    if (!title) return;
    // 找到所属卷/章并添加节点
    for (const vol of volumes) {
      const ch = vol.chapters.find((c) => c.id === chId);
      if (ch) {
        await patchChapterNodes(vol.id, chId, { nodes: [...ch.nodes, { id: `nd-${Date.now()}`, title, status: 'writing' }] });
        break;
      }
    }
    setNewNode((m) => ({ ...m, [chId]: '' }));
  };

  const generateThisChapter = (volTitle: string, chap: OutlineChapter) => {
    const summary = chap.nodes.map((n) => `- ${n.title}：${n.content || ''}`).join('\n');
    dispatchInsertStep({ bookId: String(bookId), title: `大纲·${volTitle}/${chap.title}`, content: summary });
    toast.success(`已把「${chap.title}」大纲发送到工作台，可在工作台生成此章`);
    // 标记该章节点为写作中
    for (const vol of volumes) {
      if (vol.id === volumes.find((v) => v.chapters.includes(chap))?.id) {
        for (const node of chap.nodes) {
          patchNode(vol.id, chap.id, node.id, { status: 'writing' });
        }
        break;
      }
    }
  };

  const toggle = (id: string) => setExpanded((m) => ({ ...m, [id]: !m[id] }));

  return (
    <Card className="glass-card">
      <CardHeader className="flex items-center justify-between gap-3 flex-wrap">
        <CardTitle className="flex items-center gap-2">
          <ListTodo className="w-4 h-4 text-primary" /> 项目大纲
          {stats.total > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              {stats.done}/{stats.total} 章完成
            </span>
          )}
        </CardTitle>
        {stats.total > 0 && (
          <div className="w-full sm:w-48 h-1.5 rounded-full bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${(stats.done / Math.max(1, stats.total)) * 100}%` }} />
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 新建卷 */}
        <div className="flex gap-2">
          <Input value={newVol} onChange={(e) => setNewVol(e.target.value)} placeholder="新卷名，如「第一卷·星海」" onKeyDown={(e) => e.key === 'Enter' && handleAddVolume()} />
          <Button size="sm" onClick={handleAddVolume}><Plus className="w-4 h-4" /></Button>
        </div>

        {volumes.length === 0 && (
           <p className="text-sm text-muted-foreground text-center py-6">
             还没有大纲。先建一卷，再在卷下加「章」，章下加「情节节点」（可设摘要/状态/关联角色）。
           </p>
        )}

        {volumes.map((vol) => (
          <div key={vol.id} className="rounded-xl border border-border/40">
            {/* 卷头 */}
            <div className="flex items-center gap-2 p-3">
              <button onClick={() => toggle(`v-${vol.id}`)} className="text-muted-foreground hover:text-foreground">
                <ChevronDown className={cn('w-4 h-4 transition-transform', expanded[`v-${vol.id}`] && 'rotate-180')} />
              </button>
              <Input
                value={vol.title}
                onChange={(e) => patchVolume(vol.id, { title: e.target.value })}
                className="font-medium border-none p-0 h-auto text-sm flex-1"
              />
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => removeVolume(vol.id)}>
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>

            {(expanded[`v-${vol.id}`] ?? true) && (
              <div className="px-3 pb-3 space-y-3">
                {/* 章 */}
                {vol.chapters.map((chap) => (
                  <div key={chap.id} className="rounded-lg border border-border/30 bg-background/30">
                    <div className="flex items-center gap-2 p-2.5">
                      <button onClick={() => toggle(`c-${chap.id}`)} className="text-muted-foreground hover:text-foreground">
                        <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', expanded[`c-${chap.id}`] && 'rotate-180')} />
                      </button>
                      <Input
                        value={chap.title}
                        onChange={(e) => patchChapter(vol.id, chap.id, { title: e.target.value })}
                        className="font-medium border-none p-0 h-auto text-sm flex-1"
                      />
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
                                <Input
                                  value={node.title}
                                  onChange={(e) => patchNode(vol.id, chap.id, node.id, { title: e.target.value })}
                                  className="font-medium border-none p-0 h-auto text-sm flex-1"
                                />
                                 {/* 状态切换 */}
                                 <div className="flex gap-0.5">
                                  {(['writing', 'done'] as OutlineNodeStatus[]).map((s) => (
                                    <button
                                      key={s}
                                      onClick={() => patchNode(vol.id, chap.id, node.id, { status: s })}
                                      title={STATUS_META[s].label}
                                      className={cn(
                                        'w-5 h-5 rounded-full grid place-items-center text-[9px] border',
                                        (node.status ?? 'writing') === s ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground',
                                      )}
                                    >
                                      {STATUS_META[s].label[0]}
                                    </button>
                                  ))}
                                </div>
                                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => removeNode(vol.id, chap.id, node.id)}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                              <Textarea
                                value={node.content ?? ''}
                                onChange={(e) => patchNode(vol.id, chap.id, node.id, { content: e.target.value })}
                                placeholder="情节摘要（可选）"
                                rows={2}
                                className="text-xs resize-none"
                              />
                              <div className="flex items-center gap-2 flex-wrap">
                                {/* 关联角色 */}
                                <div className="flex flex-wrap gap-1">
                                 {projChars.map((c) => {
                                   const on = node.charIds?.includes(String(c.id));
                                   return (
                                     <button
                                       key={c.id}
                                       onClick={() => {
                                         const set = new Set(node.charIds ?? []);
                                         if (on) set.delete(String(c.id)); else set.add(String(c.id));
                                         patchNode(vol.id, chap.id, node.id, { charIds: [...set] });
                                       }}
                                        className={cn('px-1.5 py-0.5 rounded-full text-[10px] border', on ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground')}
                                      >
                                        {c.name}
                                      </button>
                                    );
                                  })}
                                </div>
                                 {/* 关联设定维度 */}
                                 <div className="flex flex-wrap gap-1">
                                   {creativeSettingSections.map((sec) => {
                                     const on = node.sectionIds?.includes(sec.id);
                                     return (
                                       <button
                                         key={sec.id}
                                         onClick={() => {
                                           const set = new Set(node.sectionIds ?? []);
                                           if (on) set.delete(sec.id); else set.add(sec.id);
                                           patchNode(vol.id, chap.id, node.id, { sectionIds: [...set] });
                                         }}
                                         className={cn('px-1.5 py-0.5 rounded-full text-[10px] border', on ? 'bg-primary/10 text-primary border-primary/40' : 'border-border text-muted-foreground')}
                                       >
                                         {sec.title}
                                       </button>
                                     );
                                   })}
                                 </div>
                                    
                              </div>
                            </div>
                          );
                        })}

                        {/* 新建节点 */}
                        <div className="flex gap-2">
                          <Input value={newNode[chap.id] ?? ''} onChange={(e) => setNewNode((m) => ({ ...m, [chap.id]: e.target.value }))} placeholder="新情节节点" onKeyDown={(e) => e.key === 'Enter' && handleAddNode(chap.id)} className="text-xs" />
                          <Button size="sm" variant="outline" className="h-7" onClick={() => handleAddNode(chap.id)}><Plus className="w-3.5 h-3.5" /></Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* 新建章 */}
                <div className="flex gap-2 pl-6">
                  <Input value={newChap[vol.id] ?? ''} onChange={(e) => setNewChap((m) => ({ ...m, [vol.id]: e.target.value }))} placeholder="新章名，如「第一章·星海初现」" onKeyDown={(e) => e.key === 'Enter' && handleAddChapter(vol.id)} className="text-xs" />
                  <Button size="sm" variant="outline" className="h-7" onClick={() => handleAddChapter(vol.id)}><Plus className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
