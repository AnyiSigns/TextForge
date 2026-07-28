// src/lib/hooks/useProjectCharactersTab.ts
// ProjectCharactersTab 的逻辑层：承载全部受控 state（搜索/编辑/关系/状态/详情）、
// 角色同步、头像上传、按设定补角色、删除、状态与关系保存等副作用，
// 让 ProjectCharactersTab 组件退化为纯视图（页面=布局 / hooks=逻辑 分层）。
// 行为与抽离前保持一致，未做功能改动。
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Character, CharacterRole, CharacterRelation } from '@/types';
import { useCharacterStore } from '@/features/characters';
import { useProjectCharacters } from '@/features/projects';
import { uploadAvatar } from '@/features/characters';
import { makeRelationId, pruneRelations } from '@/features/characters/lib/characterRefs';
import { generatePart } from '@/lib/seed/generate';

export function useProjectCharactersTab(bookId: number) {
  const { projectChars, allCharacters: characters, sync: syncFromBackend } = useProjectCharacters(bookId);
  const removeCharacter = useCharacterStore((s) => s.removeCharacter);
  const updateCharacter = useCharacterStore((s) => s.updateCharacter);
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editRole, setEditRole] = useState<string>('');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [detailChar, setDetailChar] = useState<Character | null>(null);
  const [statusTarget, setStatusTarget] = useState<Character | null>(null);
  const [statusDraft, setStatusDraft] = useState('');
  const [relTarget, setRelTarget] = useState<Character | null>(null);
  const [relDraft, setRelDraft] = useState<CharacterRelation[]>([]);
  const [studioTarget, setStudioTarget] = useState<Character | null>(null);
  const [detailRole, setDetailRole] = useState<string>('');
  const avatarInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const handleAvatarChange = async (id: number, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const url = await uploadAvatar(id, file);
      await updateCharacter(id, { avatarUrl: url });
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
      const res = await generatePart(bookId, 'characters', { prompt: '为本书补充若干贴合世界观的新角色' });
      const n = res.characters?.length ?? 0;
      toast.success(`已补充 ${n} 个角色（可手动微调）`);
    } catch (e) {
      toast.error('补充角色失败', { description: e instanceof Error ? e.message : '未知错误' });
    } finally {
      setIsSeedingChars(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这个角色吗？')) return;
    try {
      await removeCharacter(id);
      toast.success('已删除');
    } catch (e) {
      toast.error('删除失败', { description: e instanceof Error ? e.message : '未知错误' });
    }
  };

  const startEdit = (char: Character) => {
    setEditingId(String(char.id));
    setEditName(char.name);
    setEditDesc(char.description);
    setEditRole(char.roleType ?? '');
  };

  const saveEdit = async (id: number) => {
    if (!editName.trim()) return;
    try {
      const patch: Partial<Character> = {
        name: editName.trim(),
        description: editDesc.trim(),
        roleType: (editRole || undefined) as CharacterRole | undefined,
      };
      await updateCharacter(Number(id), patch);
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
    setRelDraft(char.relationshipChain ? [...char.relationshipChain] : []);
  };

  const addRelation = () => {
    setRelDraft((p) => [...p, { id: makeRelationId(), target: '', relation: '' }]);
  };

  const updateRelation = (id: string, patch: Partial<CharacterRelation>) => {
    setRelDraft((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRelation = (id: string) => {
    setRelDraft((p) => p.filter((r) => r.id !== id));
  };

  const applyRelations = async () => {
    if (!relTarget) return;
    const next = pruneRelations(relDraft);
    try {
      await updateCharacter(relTarget.id, { relationshipChain: next });
      toast.success('角色关系已保存');
      setRelTarget(null);
      if (detailChar?.id === relTarget.id) {
        setDetailChar((c) => (c ? { ...c, relationshipChain: next } : c));
      }
    } catch (e) {
      toast.error('关系保存失败', { description: e instanceof Error ? e.message : '未知错误' });
    }
  };

  const charNameById = (id: string) =>
    projectChars.find((c) => String(c.id) === id)?.name ?? characters.find((c) => String(c.id) === id)?.name ?? '（未知角色）';

  const applyStatus = async () => {
    if (!statusTarget) return;
    const next = statusDraft.trim() || '存活';
    if (next === '死亡' && statusTarget.status !== '死亡') {
      if (!confirm(`确认「${statusTarget.name}」死亡？`)) return;
    }
    try {
      const patch: Partial<Character> = { status: next };
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

  // 详情 Sheet：保存故事定位（内联编辑）
  const saveDetailRole = async () => {
    if (!detailChar) return;
    try {
      const patch: Partial<Character> = { roleType: (detailRole || undefined) as CharacterRole | undefined };
      await updateCharacter(detailChar.id, patch);
      setDetailChar((c) => (c ? { ...c, ...patch } : c));
      setDetailRole('');
      toast.success('故事定位已更新');
    } catch (e) {
      toast.error('更新失败', { description: e instanceof Error ? e.message : '未知错误' });
    }
  };

  // 详情 Sheet：保存角色设定
  const saveDescription = async () => {
    if (!detailChar) return;
    try {
      await updateCharacter(detailChar.id, { description: detailChar.description ?? '' });
      toast.success('角色设定已保存');
    } catch (e) {
      toast.error('保存失败', { description: e instanceof Error ? e.message : '未知错误' });
    }
  };

  // 详情 Sheet：保存别名（称呼），用于章节正文用别名提及角色时也能自动匹配
  const saveAliases = async (aliases: string[]) => {
    if (!detailChar) return;
    try {
      await updateCharacter(detailChar.id, { aliases });
      toast.success('别名已保存');
      setDetailChar((c) => (c ? { ...c, aliases } : c));
    } catch (e) {
      toast.error('别名保存失败', { description: e instanceof Error ? e.message : '未知错误' });
    }
  };

   // 详情 Sheet：保存当前档案
   const saveCurrentProfile = async () => {
     if (!detailChar) return;
     try {
       await updateCharacter(detailChar.id, { currentProfile: detailChar.currentProfile ?? '' });
       toast.success('当前档案已保存');
     } catch (e) {
       toast.error('保存失败', { description: e instanceof Error ? e.message : '未知错误' });
     }
   };

   // 详情 Sheet：切换参考图标记
   const toggleReferenceImage = async (img: string) => {
     if (!detailChar) return;
     const current = (detailChar.referenceImages ?? []).filter(Boolean);
     const next = current.includes(img)
       ? current.filter((u) => u !== img)
       : [...current, img].slice(0, 5);
     try {
       await updateCharacter(detailChar.id, { referenceImages: next, referenceImage: next[0] ?? null });
       toast.success(next.includes(img) ? '已设为参考图' : '已移出参考图');
     } catch {
       toast.error('操作失败');
     }
   };

   // 详情 Sheet：导出全部立绘
   const exportImages = async () => {
     if (!detailChar?.avatarUrl) return;
     try {
       toast.success('角色立绘导出功能待实现');
     } catch {
       toast.error('导出失败，请重试');
     }
   };

  const filtered = projectChars.filter((c) =>
    (c.name ?? '').includes(searchTerm) || (c.description ?? '').includes(searchTerm)
  );

  return {
    // 外部数据
    projectChars,
    characters,
    filtered,
    isLoading,
    // 搜索 / 视图
    searchTerm,
    setSearchTerm,
    viewMode,
    setViewMode,
    // 编辑行
    editingId,
    setEditingId,
    editName,
    setEditName,
    editDesc,
    setEditDesc,
    editRole,
    setEditRole,
    startEdit,
    saveEdit,
    // 关系
    relTarget,
    setRelTarget,
    relDraft,
    openRelations,
    addRelation,
    updateRelation,
    removeRelation,
    applyRelations,
    charNameById,
    // 状态
    statusTarget,
    setStatusTarget,
    statusDraft,
    setStatusDraft,
    openStatus,
    applyStatus,
    // 详情
    detailChar,
    setDetailChar,
    detailRole,
    setDetailRole,
    saveDetailRole,
    saveCurrentProfile,
    saveDescription,
    saveAliases,
    toggleReferenceImage,
    exportImages,
    // 头像 / 种子 / 删除 / studio
    avatarInputRefs,
    handleAvatarChange,
    isSeedingChars,
    handleSeedChars,
    handleDelete,
    studioTarget,
    setStudioTarget,
  };
}
