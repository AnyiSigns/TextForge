// src/components/projects/OutlinePanel.tsx
'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ListTodo, ChevronDown, Plus, Trash2, FileInput, BookOpen, CheckCircle2, PenLine, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { loadOutline, saveOutline, type OutlineVolume, type OutlineChapter, type OutlineNode, type OutlineNodeStatus } from '@/lib/storage/backup';
import { dispatchInsertStep } from '@/lib/events/projectEvents';
import { useCharacterStore } from '@/lib/stores/characterStore';
import { useBriefStore } from '@/features/projects';
import { toast } from 'sonner';
import { uid } from '@/lib/utils/id';
const STATUS_META: Record<OutlineNodeStatus, { label: string; cls: string; icon: typeof Circle }> = {
  todo: { label: '未写', cls: 'text-muted-foreground', icon: Circle },
  writing: { label: '写作中', cls: 'text-amber-500', icon: PenLine },
  done: { label: '已完成', cls: 'text-green-500', icon: CheckCircle2 },
};

export function OutlinePanel({ projectId }: { projectId: string }) {
  const [volumes, setVolumes] = useState<OutlineVolume[]>([]);
  const [loaded, setLoaded] = useState(false);
  const didHydrate = useRef(false);
  const skipNextSave = useRef(false);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [newVol, setNewVol] = useState('');
  const [newChap, setNewChap] = useState<Record<string, string>>({});
  const [newNode, setNewNode] = useState<Record<string, string>>({});

  const characters = useCharacterStore((s) => s.characters);
  const brief = useBriefStore((s) => s.briefs[projectId]);
  const briefSections = brief?.sections ?? [];
  const projChars = useMemo(
    () => characters.filter((c) => (c.projectId ?? null) === projectId),
    [characters, projectId],
  );

  useEffect(() => {
    let active = true;
    setLoaded(false);
    loadOutline(projectId).then((v) => {
      if (!active) return;
      // 仅当地空时才用加载结果，避免异步晚到覆盖用户已做的编辑；
      // 且只在本次 hydration 真正填充时才跳过随后的自动保存（用户已编辑则不标 skip）。
      setVolumes((prev) => {
        if (prev.length) return prev;
        skipNextSave.current = true;
        return v;
      });
      didHydrate.current = true;
      setLoaded(true);
    }).catch(() => { if (active) { didHydrate.current = true; setLoaded(true); } });
    return () => { active = false; };
  }, [projectId]);

  // 种子生成写回大纲后，被动刷新本地 state（用户在大纲 tab 时不会错过更新）
  useEffect(() => {
    const onSeeded = (e: Event) => {
      const detail = (e as CustomEvent<{ projectId: string }>).detail;
      if (detail?.projectId !== projectId) return;
      skipNextSave.current = true;
      loadOutline(projectId).then((v) => setVolumes(v)).catch(() => {});
    };
    window.addEventListener('outline-seeded', onSeeded);
    return () => window.removeEventListener('outline-seeded', onSeeded);
  }, [projectId]);

  useEffect(() => {
    if (!didHydrate.current) return; // 首载完成前不保存，避免吞掉/误存加载前的编辑
    if (skipNextSave.current) { skipNextSave.current = false; return; }
    saveOutline(projectId, volumes).catch(() => {});
  }, [loaded, volumes, projectId]);

  const stats = useMemo(() => {
    const all = volumes.flatMap((v) => v.chapters.flatMap((c) => c.nodes));
    return { total: all.length, done: all.filter((n) => n.status === 'done').length, writing: all.filter((n) => n.status === 'writing').length };
  }, [volumes]);

  // ---- 卷 ----
  const addVolume = () => {
    if (!newVol.trim()) return;
    setVolumes([...volumes, { id: uid('vol'), title: newVol.trim(), chapters: [], origin: 'init' }]);
    setNewVol('');
  };
  const patchVolume = (id: string, patch: Partial<OutlineVolume>) =>
    setVolumes((vs) => vs.map((v) => (v.id === id ? { ...v, ...patch } : v)));
  const removeVolume = (id: string) => setVolumes((vs) => vs.filter((v) => v.id !== id));

  // ---- 章 ----
  const addChapter = (volId: string) => {
    const title = newChap[volId]?.trim();
    if (!title) return;
    setVolumes((vs) => vs.map((v) => (v.id === volId ? { ...v, chapters: [...v.chapters, { id: uid('ch'), title, nodes: [], origin: 'init' }] } : v)));
    setNewChap((m) => ({ ...m, [volId]: '' }));
  };
  const removeChapter = (volId: string, chId: string) =>
    setVolumes((vs) => vs.map((v) => (v.id === volId ? { ...v, chapters: v.chapters.filter((c) => c.id !== chId) } : v)));

  // ---- 节点 ----
  const addNode = (chId: string) => {
    const title = newNode[chId]?.trim();
    if (!title) return;
    setVolumes((vs) => vs.map((v) => ({
      ...v,
      chapters: v.chapters.map((c) => (c.id === chId ? { ...c, nodes: [...c.nodes, { id: uid('nd'), title, status: 'todo', origin: 'init' }] } : c)),
    })));
    setNewNode((m) => ({ ...m, [chId]: '' }));
  };
  const patchNode = (chId: string, nid: string, patch: Partial<OutlineNode>) =>
    setVolumes((vs) => vs.map((v) => ({
      ...v,
      chapters: v.chapters.map((c) => (c.id === chId ? { ...c, nodes: c.nodes.map((n) => (n.id === nid ? { ...n, ...patch } : n)) } : c)),
    })));
  const removeNode = (chId: string, nid: string) =>
    setVolumes((vs) => vs.map((v) => ({
      ...v,
      chapters: v.chapters.map((c) => (c.id === chId ? { ...c, nodes: c.nodes.filter((n) => n.id !== nid) } : c)),
    })));

  const sendToWorkbench = (node: OutlineNode) => {
    dispatchInsertStep({ projectId, title: node.title, content: node.content || '' });
    toast.success(`已把「${node.title}」发送到工作台`);
  };
  const generateThisChapter = (volTitle: string, chap: OutlineChapter) => {
    const summary = chap.nodes.map((n) => `- ${n.title}：${n.content || ''}`).join('\n');
    dispatchInsertStep({ projectId, title: `大纲·${volTitle}/${chap.title}`, content: summary });
    toast.success(`已把「${chap.title}」大纲发送到工作台，可在工作台生成此章`);
    // 标记该章节点为写作中
    chap.nodes.forEach((n) => patchNode(chap.id, n.id, { status: 'writing' }));
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
            <div className="h-full bg-primary transition-all" style={{ width: `${(stats.done / stats.total) * 100}%` }} />
          </div>
        )}
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 新建卷 */}
        <div className="flex gap-2">
          <Input value={newVol} onChange={(e) => setNewVol(e.target.value)} placeholder="新卷名，如「第一卷·星海」" onKeyDown={(e) => e.key === 'Enter' && addVolume()} />
          <Button size="sm" onClick={addVolume}><Plus className="w-4 h-4" /></Button>
        </div>

        {volumes.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">
            还没有大纲。先建一卷，再在卷下加「章」，章下加「情节节点」（可设摘要/状态/目标字数/关联角色）。
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
                        onChange={(e) => setVolumes((vs) => vs.map((v) => (v.id === vol.id ? { ...v, chapters: v.chapters.map((c) => (c.id === chap.id ? { ...c, title: e.target.value } : c)) } : v)))}
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
                          const st = STATUS_META[node.status ?? 'todo'];
                          const StIcon = st.icon;
                          return (
                            <div key={node.id} className="rounded-lg border border-border/30 p-2.5 space-y-2">
                              <div className="flex items-center gap-2">
                                <StIcon className={cn('w-3.5 h-3.5 shrink-0', st.cls)} />
                                <Input
                                  value={node.title}
                                  onChange={(e) => patchNode(chap.id, node.id, { title: e.target.value })}
                                  className="font-medium border-none p-0 h-auto text-sm flex-1"
                                />
                                {/* 状态切换 */}
                                <div className="flex gap-0.5">
                                  {(['todo', 'writing', 'done'] as OutlineNodeStatus[]).map((s) => (
                                    <button
                                      key={s}
                                      onClick={() => patchNode(chap.id, node.id, { status: s })}
                                      title={STATUS_META[s].label}
                                      className={cn(
                                        'w-5 h-5 rounded-full grid place-items-center text-[9px] border',
                                        (node.status ?? 'todo') === s ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground',
                                      )}
                                    >
                                      {STATUS_META[s].label[0]}
                                    </button>
                                  ))}
                                </div>
                                <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive" onClick={() => removeNode(chap.id, node.id)}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                              <Textarea
                                value={node.content ?? ''}
                                onChange={(e) => patchNode(chap.id, node.id, { content: e.target.value })}
                                placeholder="情节要点 / 摘要…"
                                rows={2}
                                className="text-xs resize-none"
                              />
                              <div className="flex items-center gap-2 flex-wrap">
                                <Input
                                  type="number"
                                  value={node.targetWords ?? ''}
                                  onChange={(e) => patchNode(chap.id, node.id, { targetWords: Number(e.target.value) || undefined })}
                                  placeholder="目标字数"
                                  className="w-24 h-7 text-xs"
                                />
                                {/* 关联角色 */}
                                <div className="flex flex-wrap gap-1">
                                  {projChars.map((c) => {
                                    const on = node.charIds?.includes(c.id);
                                    return (
                                      <button
                                        key={c.id}
                                        onClick={() => {
                                          const set = new Set(node.charIds ?? []);
                                          if (on) set.delete(c.id); else set.add(c.id);
                                          patchNode(chap.id, node.id, { charIds: [...set] });
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
                                  {briefSections.map((sec) => {
                                    const on = node.sectionIds?.includes(sec.id);
                                    return (
                                      <button
                                        key={sec.id}
                                        onClick={() => {
                                          const set = new Set(node.sectionIds ?? []);
                                          if (on) set.delete(sec.id); else set.add(sec.id);
                                          patchNode(chap.id, node.id, { sectionIds: [...set] });
                                        }}
                                        className={cn('px-1.5 py-0.5 rounded-full text-[10px] border', on ? 'bg-primary/10 text-primary border-primary/40' : 'border-border text-muted-foreground')}
                                      >
                                        {sec.title}
                                      </button>
                                    );
                                  })}
                                </div>
                                <Button variant="ghost" size="sm" className="text-xs text-primary ml-auto" onClick={() => sendToWorkbench(node)}>
                                  <FileInput className="w-3 h-3 mr-1" /> 插到工作台
                                </Button>
                              </div>
                            </div>
                          );
                        })}

                        {/* 新建节点 */}
                        <div className="flex gap-2">
                          <Input value={newNode[chap.id] ?? ''} onChange={(e) => setNewNode((m) => ({ ...m, [chap.id]: e.target.value }))} placeholder="新情节节点" onKeyDown={(e) => e.key === 'Enter' && addNode(chap.id)} className="text-xs" />
                          <Button size="sm" variant="outline" className="h-7" onClick={() => addNode(chap.id)}><Plus className="w-3.5 h-3.5" /></Button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}

                {/* 新建章 */}
                <div className="flex gap-2 pl-6">
                  <Input value={newChap[vol.id] ?? ''} onChange={(e) => setNewChap((m) => ({ ...m, [vol.id]: e.target.value }))} placeholder="新章名，如「第一章·星海初现」" onKeyDown={(e) => e.key === 'Enter' && addChapter(vol.id)} className="text-xs" />
                  <Button size="sm" variant="outline" className="h-7" onClick={() => addChapter(vol.id)}><Plus className="w-3.5 h-3.5" /></Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
