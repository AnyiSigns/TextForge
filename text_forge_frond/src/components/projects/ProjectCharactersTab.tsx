// src/components/projects/ProjectCharactersTab.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search, Users, UserPlus, Pencil, MessageCircle, Trash2, Eye, Images, Skull, Heart, CircleDot, Upload, Lock, ImageOff, Download, Sparkles, List, LayoutGrid, Link2 } from 'lucide-react';
import { toast } from 'sonner';
import { Character, CharacterRole, CharacterRelationship } from '@/types';
import { EmptyState, Spinner } from '@/components/shared/states';
import { useCharacterStore } from '@/lib/stores/characterStore';
import { useProjectCharacters } from '@/lib/hooks/useProjectCharacters';
import { uploadAvatar } from '@/lib/api/characters';
import { generatePart } from '@/lib/seed/generate';
import { downloadImagesZip } from '@/lib/storage/imageExport';
import { CHARACTER_ROLE_LABELS, characterRoleLabel } from '@/lib/workflow/agentRoles';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { CharacterStudioSheet } from '@/components/characters/CharacterStudioSheet';
import Image from 'next/image';

// 状态预设（string 支持自定义）
const STATUS_PRESETS = ['存活', '重伤', '失踪', '囚禁', '死亡', '未知'];

// 故事定位预设：基于共享 CHARACTER_ROLE_LABELS 生成（保证与 page.tsx buildContext 同源），
// 末尾补一个「自定义」选项。避免与角色 label 映射分叉。
const ROLE_PRESETS: { value: CharacterRole; label: string }[] = [
  ...(Object.keys(CHARACTER_ROLE_LABELS) as CharacterRole[]).map((value) => ({
    value,
    label: CHARACTER_ROLE_LABELS[value],
  })),
  { value: 'custom', label: '自定义' },
];

function statusBadge(status?: string) {
  if (!status) return null;
  const dead = status === '死亡';
  const color = dead
    ? 'bg-destructive/15 text-destructive'
    : status === '存活'
      ? 'bg-green-500/15 text-green-600'
      : 'bg-amber-500/15 text-amber-600';
  const Icon = dead ? Skull : status === '存活' ? Heart : CircleDot;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${color}`}>
      <Icon className="w-3 h-3" /> {status}
    </span>
  );
}

function roleLabel(char: Character | { role?: string; customRole?: string }): string | null {
  const role = char.role;
  if (!role) return null;
  if (role === 'custom') return char.customRole?.trim() || null;
  return characterRoleLabel(role) ?? role;
}

export function ProjectCharactersTab({ projectId }: { projectId: string }) {
  const { projectChars, allCharacters: characters, sync: syncFromBackend } = useProjectCharacters(projectId);
  const removeCharacter = useCharacterStore((s) => s.removeCharacter);
  const updateCharacter = useCharacterStore((s) => s.updateCharacter);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editRole, setEditRole] = useState<string>('');
  const [editCustomRole, setEditCustomRole] = useState<string>('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [detailChar, setDetailChar] = useState<Character | null>(null);
  const [statusTarget, setStatusTarget] = useState<Character | null>(null);
  const [statusDraft, setStatusDraft] = useState('');
  const [relTarget, setRelTarget] = useState<Character | null>(null);
  const [relDraft, setRelDraft] = useState<CharacterRelationship[]>([]);
  const [studioTarget, setStudioTarget] = useState<Character | null>(null);
  const [detailRole, setDetailRole] = useState<string>('');
  const [detailCustomRole, setDetailCustomRole] = useState<string>('');
  const avatarInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleAvatarChange = async (id: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const url = await uploadAvatar(id, file);
      await updateCharacter(id, { avatar: url });
      toast.success('头像已更新');
    } catch (err) {
      toast.error('头像更新失败', { description: err instanceof Error ? err.message : '未知错误' });
    }
  };

  useEffect(() => {
    syncFromBackend()
      .catch((e: unknown) => toast.error('加载失败', { description: e instanceof Error ? e.message : '未知错误' }))
      .finally(() => setIsLoading(false));
  }, [syncFromBackend]);

  // 中途单补角色：按当前项目设定生成新角色，增量合并（不覆盖用户已有角色）
  const [isSeedingChars, setIsSeedingChars] = useState(false);
  const handleSeedChars = async () => {
    if (isSeedingChars) return;
    setIsSeedingChars(true);
    try {
      const res = await generatePart(projectId, 'characters', { prompt: '为本书补充若干贴合世界观的新角色' });
      const n = res.characters?.length ?? 0;
      toast.success(`已补充 ${n} 个角色（可手动微调）`);
    } catch (e) {
      toast.error('补充角色失败', { description: e instanceof Error ? e.message : '未知错误' });
    } finally {
      setIsSeedingChars(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个角色吗？')) return;
    try {
      await removeCharacter(id);
      toast.success('已删除');
    } catch (e) {
      toast.error('删除失败', { description: e instanceof Error ? e.message : '未知错误' });
    }
  };

  const startEdit = (char: Character) => {
    setEditingId(char.id);
    setEditName(char.name);
    setEditDesc(char.description);
    setEditRole(char.role ?? '');
    setEditCustomRole(char.customRole ?? '');
  };

  const saveEdit = async (id: string) => {
    if (!editName.trim()) return;
    try {
      const patch: Partial<Character> = {
        name: editName.trim(),
        description: editDesc.trim(),
        role: (editRole || undefined) as CharacterRole | undefined,
      };
      if (editRole === 'custom') patch.customRole = editCustomRole.trim() || '自定义';
      await updateCharacter(id, patch);
      toast.success('角色已更新');
      setEditingId(null);
    } catch (e) {
      toast.error('更新失败', { description: e instanceof Error ? e.message : '未知错误' });
    }
  };

  const openStatus = (char: Character) => {
    setStatusTarget(char);
    setStatusDraft(char.status ?? '存活');
  };

  const openRelations = (char: Character) => {
    setRelTarget(char);
    setRelDraft(char.relationships ? [...char.relationships] : []);
  };

  const addRelation = () => {
    setRelDraft((p) => [...p, { id: `rel-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, targetId: '', relation: '' }]);
  };

  const updateRelation = (id: string, patch: Partial<CharacterRelationship>) => {
    setRelDraft((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRelation = (id: string) => {
    setRelDraft((p) => p.filter((r) => r.id !== id));
  };

  const applyRelations = async () => {
    if (!relTarget) return;
    // 仅保留已选对端且填写了关系描述的项
    const next = relDraft.filter((r) => r.targetId && r.relation.trim());
    try {
      await updateCharacter(relTarget.id, { relationships: next });
      toast.success('角色关系已保存');
      setRelTarget(null);
      if (detailChar?.id === relTarget.id) {
        setDetailChar((c) => (c ? { ...c, relationships: next } : c));
      }
    } catch (e) {
      toast.error('关系保存失败', { description: e instanceof Error ? e.message : '未知错误' });
    }
  };

  const charNameById = (id: string) =>
    projectChars.find((c) => c.id === id)?.name ?? characters.find((c) => c.id === id)?.name ?? '（未知角色）';

  const applyStatus = async () => {
    if (!statusTarget) return;
    const next = statusDraft.trim() || '存活';
    // 剧情性死亡：二次确认，确认后写入 currentProfile 节点
    if (next === '死亡' && statusTarget.status !== '死亡') {
      if (!confirm(`确认「${statusTarget.name}」死亡？\n该状态将更新其当前档案并通知后续生成上下文。`)) return;
    }
    try {
      const patch: Partial<Character> = { status: next };
      if (next === '死亡') {
        const stamp = `于剧情中死亡（由作者确认）`;
        const base = statusTarget.currentProfile ? `${statusTarget.currentProfile}\n` : '';
        patch.currentProfile = `${base}${stamp}`;
      }
      await updateCharacter(statusTarget.id, patch);
      toast.success('角色状态已更新');
      setStatusTarget(null);
      if (detailChar?.id === statusTarget.id) {
        setDetailChar((c) => (c ? { ...c, ...patch } : c));
      }
    } catch (e) {
      toast.error('状态更新失败', { description: e instanceof Error ? e.message : '未知错误' });
    }
  };

  const filtered = projectChars.filter((c) =>
    (c.name ?? '').includes(searchTerm) || (c.description ?? '').includes(searchTerm)
  );

  if (isLoading) {
    return <Spinner label="正在加载角色..." />;
  }

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="搜索本项目角色..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" onClick={handleSeedChars} disabled={isSeedingChars}>
          <Sparkles className="w-4 h-4 mr-1.5" />
          {isSeedingChars ? '生成中…' : '按设定补角色'}
        </Button>
        <div className="flex rounded-md border border-border/40 overflow-hidden shrink-0">
          <Button
            variant={viewMode === 'list' ? 'default' : 'ghost'}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setViewMode('list')}
            aria-label="列表视图"
          >
            <List className="w-4 h-4" />
          </Button>
          <Button
            variant={viewMode === 'grid' ? 'default' : 'ghost'}
            size="sm"
            className="h-8 w-8 p-0"
            onClick={() => setViewMode('grid')}
            aria-label="网格视图"
          >
            <LayoutGrid className="w-4 h-4" />
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">基于当前世界观/已有角色，增量补充新角色（不覆盖已有）</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={characters.length === 0 ? '本项目还没有角色' : '没有匹配的角色'}
          description={characters.length === 0 ? '为这个项目创建专属角色，对话与生成都将带上项目设定' : '试试别的关键词'}
          action={characters.length === 0 ? (
            <Button asChild size="sm">
              <Link href={`/characters/create?projectId=${projectId}`}>
                <UserPlus className="w-4 h-4 mr-2" /> 创建角色
              </Link>
            </Button>
          ) : undefined}
        />
      ) : viewMode === 'list' ? (
        <div className="space-y-2 stagger">
          {filtered.map((char) => (
            <div key={char.id} className="flex items-center gap-3 p-2.5 border border-border/40 rounded-xl bg-background/30">
              {editingId === char.id ? (
                <div className="flex-1 min-w-0 space-y-2 w-full">
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    placeholder="角色名"
                    className="h-9 rounded-xl"
                    autoFocus
                  />
                  <Textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    placeholder="角色描述..."
                    rows={2}
                    className="text-sm rounded-xl"
                  />
                  <div className="space-y-1.5">
                    <label className="text-xs text-muted-foreground">故事定位</label>
                    <select
                      value={editRole}
                      onChange={(e) => setEditRole(e.target.value)}
                      className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
                    >
                      <option value="">未设定</option>
                      {ROLE_PRESETS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    {editRole === 'custom' && (
                      <Input
                        value={editCustomRole}
                        onChange={(e) => setEditCustomRole(e.target.value)}
                        placeholder="自定义定位，如：亦正亦邪的军师"
                        className="mt-1.5 h-9 rounded-xl text-sm"
                      />
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" className="flex-1 rounded-xl" onClick={() => saveEdit(char.id)}>保存</Button>
                    <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEditingId(null)}>取消</Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="relative shrink-0">
                    <Avatar className="w-10 h-10 rounded-xl border border-border/40">
                      <AvatarImage src={char.avatar} />
                      <AvatarFallback className="text-sm rounded-xl">{char.name.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-medium truncate">{char.name}</p>
                      {roleLabel(char) && (
                        <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{roleLabel(char)}</span>
                      )}
                      {statusBadge(char.status)}
                    </div>
                    <p className="text-xs text-muted-foreground truncate mt-0.5">{char.description || '暂无描述'}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button asChild size="sm" variant="default" className="rounded-xl">
                      <Link href={`/characters/${char.id}/chat`}>
                        <MessageCircle className="w-4 h-4 mr-1.5" /> 对话
                      </Link>
                    </Button>
                <Button variant="outline" size="sm" className="rounded-xl" onClick={() => openRelations(char)} title="设置角色关系">
                  <Link2 className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setStudioTarget(char)} title="生成立绘 / 素材">
                  <Sparkles className="w-4 h-4" />
                </Button>
                <Button variant="outline" size="sm" className="rounded-xl" onClick={() => openStatus(char)} title="设置角色状态">
                  <CircleDot className="w-4 h-4" />
                </Button>
                    <Button variant="outline" size="sm" className="rounded-xl" onClick={() => setDetailChar(char)} title="查看角色详情">
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button variant="outline" size="sm" className="rounded-xl" onClick={() => startEdit(char)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-destructive rounded-xl" onClick={() => handleDelete(char.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 stagger">
          {filtered.map((char) => (
            <Card key={char.id} className="group rounded-3xl p-1 hover:shadow-xl transition-all duration-300 hover:-translate-y-0.5">
              <CardHeader className="px-5 pt-5 pb-3">
                <div className="flex items-center gap-3.5">
                  <div className="relative shrink-0">
                    <Avatar className="w-14 h-14 rounded-2xl border border-border/40 shadow-sm">
                      <AvatarImage src={char.avatar} />
                      <AvatarFallback className="text-lg rounded-2xl">{char.name.slice(0, 2)}</AvatarFallback>
                    </Avatar>
                    {editingId === char.id && (
                      <button
                        type="button"
                        onClick={() => avatarInputRefs.current[char.id]?.click()}
                        className="absolute -bottom-1 -right-1 grid place-items-center w-6 h-6 rounded-full bg-primary text-primary-foreground ring-2 ring-background"
                        title="更换头像"
                        aria-label="更换头像"
                      >
                        <Upload className="w-3 h-3" />
                      </button>
                    )}
                    <input
                      ref={(el) => { avatarInputRefs.current[char.id] = el; }}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => handleAvatarChange(char.id, e)}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    {editingId === char.id ? (
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        className="h-9 text-sm rounded-xl"
                        autoFocus
                      />
                    ) : (
                      <CardTitle className="text-lg truncate tracking-tight">{char.name}</CardTitle>
                    )}
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                {roleLabel(char) && (
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium">{roleLabel(char)}</span>
                )}
                      {statusBadge(char.status)}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="px-5 pb-5">
                {editingId === char.id ? (
                  <div className="space-y-3">
                    <Textarea
                      value={editDesc}
                      onChange={(e) => setEditDesc(e.target.value)}
                      placeholder="角色描述..."
                      rows={2}
                      className="text-sm rounded-xl"
                    />
                    <div className="space-y-1.5">
                      <label className="text-xs text-muted-foreground">故事定位</label>
                      <select
                        value={editRole}
                        onChange={(e) => setEditRole(e.target.value)}
                        className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
                      >
                        <option value="">未设定</option>
                        {ROLE_PRESETS.map((r) => (
                          <option key={r.value} value={r.value}>{r.label}</option>
                        ))}
                      </select>
                      {editRole === 'custom' && (
                        <Input
                          value={editCustomRole}
                          onChange={(e) => setEditCustomRole(e.target.value)}
                          placeholder="自定义定位，如：亦正亦邪的军师"
                          className="mt-1.5 h-9 rounded-xl text-sm"
                        />
                      )}
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="flex-1 rounded-xl" onClick={() => saveEdit(char.id)}>保存</Button>
                      <Button size="sm" variant="outline" className="rounded-xl" onClick={() => setEditingId(null)}>取消</Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground leading-relaxed line-clamp-2 mb-4">{char.description || '暂无描述'}</p>
                    <div className="flex items-center gap-2">
                      <Button asChild size="sm" className="flex-1 rounded-xl">
                        <Link href={`/characters/${char.id}/chat`}>
                          <MessageCircle className="w-4 h-4 mr-2" /> 对话
                        </Link>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => openRelations(char)}
                        title="设置角色关系"
                      >
                        <Link2 className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => setStudioTarget(char)}
                        title="生成立绘 / 素材"
                      >
                        <Sparkles className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => openStatus(char)}
                        title="设置角色状态"
                      >
                        <CircleDot className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => setDetailChar(char)}
                        title="查看角色详情"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-xl"
                        onClick={() => startEdit(char)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive rounded-xl"
                        onClick={() => handleDelete(char.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          ))          }
        </div>
      )}

      <div className="flex justify-end">
        <Button asChild variant="outline" size="sm">
          <Link href={`/characters/create?projectId=${projectId}`}>
            <Plus className="w-4 h-4 mr-2" /> 新建本项目角色
          </Link>
        </Button>
      </div>

      <Sheet open={!!detailChar} onOpenChange={(o) => !o && setDetailChar(null)}>
        <SheetContent side="right" className="glass-sheet w-full sm:max-w-[22rem] overflow-y-auto rounded-l-3xl">
          {detailChar && (
            <>
              <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/30">
                <SheetTitle className="flex items-center gap-3 text-xl">
                  <Avatar className="w-11 h-11 ring-1 ring-border/40">
                    <AvatarImage src={detailChar.avatar} />
                    <AvatarFallback className="text-base">{detailChar.name.slice(0, 2)}</AvatarFallback>
                  </Avatar>
                  <span className="tracking-tight">{detailChar.name}</span>
                </SheetTitle>
                <SheetDescription className="text-[13px]">角色设定、当前状态与图库</SheetDescription>
              </SheetHeader>

              <div className="mt-5 px-5 space-y-5">
                <div className="flex items-center gap-2 flex-wrap">
                  {roleLabel(detailChar) && (
                    <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary font-medium tracking-wide">{roleLabel(detailChar)}</span>
                  )}
                  {statusBadge(detailChar.status)}
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={() => openStatus(detailChar)}>
                    <CircleDot className="w-3.5 h-3.5 mr-1" /> 设置状态
                  </Button>
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={() => { setDetailRole(detailChar.role ?? ''); setDetailCustomRole(detailChar.customRole ?? ''); }}>
                    <Pencil className="w-3.5 h-3.5 mr-1" /> 编辑定位
                  </Button>
                </div>

                {(detailRole !== '' || detailChar.role) && (
                  <div className="space-y-1.5 rounded-xl border border-border/40 p-3">
                    <label className="text-xs text-muted-foreground">故事定位</label>
                    <select
                      value={detailRole}
                      onChange={(e) => setDetailRole(e.target.value)}
                      className="w-full h-9 rounded-xl border border-border bg-background px-3 text-sm"
                    >
                      <option value="">未设定</option>
                      {ROLE_PRESETS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                    {detailRole === 'custom' && (
                      <Input
                        value={detailCustomRole}
                        onChange={(e) => setDetailCustomRole(e.target.value)}
                        placeholder="自定义定位，如：亦正亦邪的军师"
                        className="mt-1.5 h-9 rounded-xl text-sm"
                      />
                    )}
                    <Button size="sm" className="rounded-xl w-full" onClick={async () => {
                      try {
                        const patch: Partial<Character> = { role: (detailRole || undefined) as CharacterRole | undefined };
                        if (detailRole === 'custom') patch.customRole = detailCustomRole.trim() || '自定义';
                        await updateCharacter(detailChar.id, patch);
                        setDetailChar((c) => (c ? { ...c, ...patch } : c));
                        setDetailRole('');
                        toast.success('故事定位已更新');
                      } catch (e) {
                        toast.error('更新失败', { description: e instanceof Error ? e.message : '未知错误' });
                      }
                    }}>保存定位</Button>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">角色设定 / 介绍</p>
                  <div className="glass-sheet-card p-5">
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{detailChar.description || '暂无设定'}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">当前时间点详情（随剧情演化）</p>
                  <Textarea
                    value={detailChar.currentProfile ?? ''}
                    onChange={(e) => setDetailChar((c) => (c ? { ...c, currentProfile: e.target.value } : c))}
                    placeholder="记录角色当前心理、关系、处境、关键变化…这部分会随章节生成注入上下文。"
                    rows={4}
                    className="text-sm rounded-2xl bg-background/40 border-border/30 focus-visible:border-primary/40"
                  />
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={async () => {
                    try {
                      await updateCharacter(detailChar.id, { currentProfile: detailChar.currentProfile ?? '' });
                      toast.success('当前档案已保存');
                    } catch (e) {
                      toast.error('保存失败', { description: e instanceof Error ? e.message : '未知错误' });
                    }
                  }}>保存当前档案</Button>
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em] flex items-center gap-1.5">
                    <Link2 className="w-3.5 h-3.5" /> 角色关系（{detailChar.relationships?.length ?? 0}）
                  </p>
                  {detailChar.relationships && detailChar.relationships.length > 0 ? (
                    <div className="space-y-1.5">
                      {detailChar.relationships.map((r) => (
                        <div key={r.id} className="flex items-center gap-2 text-sm">
                          <span className="font-medium">{charNameById(r.targetId)}</span>
                          <span className="text-muted-foreground/60">·</span>
                          <span className="text-muted-foreground truncate">{r.relation}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">暂无设定关系。</p>
                  )}
                  <Button size="sm" variant="outline" className="rounded-xl" onClick={() => openRelations(detailChar)}>
                    <Link2 className="w-3.5 h-3.5 mr-1" /> 编辑关系
                  </Button>
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em] flex items-center gap-1.5">
                    <Images className="w-3.5 h-3.5" /> 角色图库（{detailChar.images?.length ?? 0}）
                  </p>
                  {detailChar.images && detailChar.images.length > 0 ? (
                    <div className="grid grid-cols-2 gap-2">
                      {detailChar.images?.map((img, i) => {
                        const isRef = detailChar.referenceImage === img;
                        return (
                          <div key={i} className="relative aspect-square rounded-2xl overflow-hidden border border-border/30 ring-1 ring-inset ring-white/5 group">
                            <Image src={img} alt={`${detailChar.name} 图${i + 1}`} fill className="object-cover" />
                            {isRef && (
                              <span className="absolute top-0.5 left-0.5 text-[9px] px-1 rounded-full bg-primary text-primary-foreground">参考</span>
                            )}
                            <div className="absolute inset-0 flex items-center justify-center gap-1 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity">
                              {isRef ? (
                                <button
                                  type="button"
                                  title="取消参考图"
                                  onClick={() => { updateCharacter(detailChar.id, { referenceImage: null }).catch(() => {}); toast.success('已取消参考图，后续生图不再强制一致'); }}
                                  className="w-6 h-6 grid place-items-center rounded-full bg-white/90 text-foreground"
                                >
                                  <ImageOff className="w-3 h-3" />
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  title="设为参考图"
                                  onClick={() => { updateCharacter(detailChar.id, { referenceImage: img }).catch(() => {}); toast.success('已设为参考图，后续生成立绘会更一致'); }}
                                  className="w-6 h-6 grid place-items-center rounded-full bg-primary text-primary-foreground"
                                >
                                  <Lock className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">该角色暂无可图片。可在「AI 绘画」选择本项目与角色生成，完成后会自动加入此处。</p>
                  )}
                  {detailChar.images && detailChar.images.length > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-xl mt-2"
                      onClick={async () => {
                        try {
                          const { ok, failed } = await downloadImagesZip(detailChar.images!, `${detailChar.name}-立绘`, detailChar.name);
                          if (failed > 0) toast.success(`已导出 ${ok} 张（${failed} 张跨域受限，已存来源链接）`);
                          else toast.success(`已导出 ${ok} 张立绘`);
                        } catch {
                          toast.error('导出失败，请重试');
                        }
                      }}
                    >
                      <Download className="w-3.5 h-3.5 mr-1.5" /> 导出全部立绘（{detailChar.images.length}）
                    </Button>
                  )}
                  {detailChar.referenceImage ? (
                    <p className="text-[11px] text-primary flex items-center gap-1 mt-1.5">
                      <Lock className="w-3 h-3" /> 已锁定参考图，生成立绘会尽量保持一致；可在上方取消。
                    </p>
                  ) : (
                    <p className="text-[11px] text-muted-foreground mt-1.5">未设参考图：生图每次外观可能不同。设一张为参考图可保证多图一致。</p>
                  )}
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* 状态设置弹窗 */}
      <Sheet open={!!statusTarget} onOpenChange={(o) => !o && setStatusTarget(null)}>
        <SheetContent side="right" className="glass-sheet w-full sm:max-w-[20rem] rounded-l-3xl">
          {statusTarget && (
            <>
              <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/30">
                <SheetTitle className="text-xl tracking-tight">设置角色状态 · {statusTarget.name}</SheetTitle>
                <SheetDescription className="text-[13px]">状态变化会通知后续章节生成上下文，帮助把控全局。</SheetDescription>
              </SheetHeader>
              <div className="mt-5 px-5 space-y-4">
                <div className="flex flex-wrap gap-2">
                  {STATUS_PRESETS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatusDraft(s)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${statusDraft === s ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'border-border/60 bg-background/30 hover:border-primary/50'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs text-muted-foreground">自定义状态</label>
                  <Input
                    value={statusDraft}
                    onChange={(e) => setStatusDraft(e.target.value)}
                    placeholder="如 半疯魔 / 假死脱身"
                    className="rounded-xl bg-background/40 border-border/30 focus-visible:border-primary/40"
                  />
                </div>
                <Button className="rounded-xl px-6" onClick={applyStatus}>
                  确认状态
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* 关系设置弹窗：可自定义「与谁、什么关系」 */}
      <Sheet open={!!relTarget} onOpenChange={(o) => !o && setRelTarget(null)}>
        <SheetContent side="right" className="glass-sheet w-full sm:max-w-[22rem] overflow-y-auto rounded-l-3xl">
          {relTarget && (
            <>
              <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/30">
                <SheetTitle className="text-xl tracking-tight">角色关系 · {relTarget.name}</SheetTitle>
                <SheetDescription className="text-[13px]">自由添加与本项目其他角色的关系，如「宿敌」「师徒」「暗恋」。可自定义任意描述。</SheetDescription>
              </SheetHeader>
              <div className="mt-5 px-5 space-y-3">
                {relDraft.length === 0 && (
                  <p className="text-xs text-muted-foreground">还没有设定关系，点击下方「添加关系」开始。</p>
                )}
                {relDraft.map((r) => (
                  <div key={r.id} className="space-y-2 rounded-xl border border-border/40 p-3">
                    <div className="flex items-center gap-2">
                      <select
                        value={r.targetId}
                        onChange={(e) => updateRelation(r.id, { targetId: e.target.value })}
                        className="flex-1 h-9 rounded-xl border border-border bg-background px-3 text-sm"
                      >
                        <option value="">选择角色…</option>
                        {projectChars.filter((c) => c.id !== relTarget.id).map((c) => (
                          <option key={c.id} value={c.id}>{c.name}</option>
                        ))}
                      </select>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-muted-foreground hover:text-destructive rounded-xl"
                        onClick={() => removeRelation(r.id)}
                        aria-label="删除该关系"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    <Input
                      value={r.relation}
                      onChange={(e) => updateRelation(r.id, { relation: e.target.value })}
                      placeholder="关系描述，如：青梅竹马 / 宿敌 / 暗恋"
                      className="rounded-xl bg-background/40 border-border/30"
                    />
                  </div>
                ))}
                <Button variant="outline" size="sm" className="rounded-xl" onClick={addRelation}>
                  <Plus className="w-4 h-4 mr-1.5" /> 添加关系
                </Button>
                <Button className="rounded-xl px-6 w-full" onClick={applyRelations}>
                  保存关系
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {studioTarget && (
        <CharacterStudioSheet
          character={studioTarget}
          open={!!studioTarget}
          onOpenChange={(o) => !o && setStudioTarget(null)}
        />
      )}
    </div>
  );
}


