// src/lib/hooks/useProjectCharactersTab.ts
// ProjectCharactersTab 的逻辑层：承载全部受控 state（搜索/编辑/关系/状态/详情）、
// 角色同步、头像上传、按设定补角色、删除、状态与关系保存等副作用，
// 让 ProjectCharactersTab 组件退化为纯视图（页面=布局 / hooks=逻辑 分层）。
// 行为与抽离前保持一致，未做功能改动。
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { Character, CharacterRole, CharacterRelationship } from '@/types';
import { useCharacterStore } from '@/lib/stores/characterStore';
import { useProjectCharacters } from '@/lib/hooks/useProjectCharacters';
import { uploadAvatar } from '@/lib/api/characters';
import { generatePart } from '@/lib/seed/generate';
import { downloadImagesZip } from '@/lib/storage/imageExport';

export function useProjectCharactersTab(projectId: string) {
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

  // 详情 Sheet：保存故事定位（内联编辑）
  const saveDetailRole = async () => {
    if (!detailChar) return;
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

  // 详情 Sheet：切换某张图为参考图（多选，最多 5 张）
  const toggleReferenceImage = (img: string) => {
    if (!detailChar) return;
    const current = (detailChar.referenceImages ?? []).filter(Boolean);
    const next = current.includes(img)
      ? current.filter((u) => u !== img)
      : [...current, img].slice(0, 5);
    updateCharacter(detailChar.id, { referenceImages: next, referenceImage: next[0] ?? null }).catch(() => {});
    toast.success(next.includes(img) ? '已加入参考图，后续生图会更一致' : '已移出参考图');
  };

  // 详情 Sheet：导出全部立绘
  const exportImages = async () => {
    if (!detailChar?.images) return;
    try {
      const { ok, failed } = await downloadImagesZip(detailChar.images, `${detailChar.name}-立绘`, detailChar.name);
      if (failed > 0) toast.success(`已导出 ${ok} 张（${failed} 张跨域受限，已存来源链接）`);
      else toast.success(`已导出 ${ok} 张立绘`);
    } catch {
      toast.error('导出失败，请重试');
    }
  };

  // 详情 Sheet：打开定位编辑
  const openDetailRoleEdit = (char: Character) => {
    setDetailRole(char.role ?? '');
    setDetailCustomRole(char.customRole ?? '');
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
    editCustomRole,
    setEditCustomRole,
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
    detailCustomRole,
    setDetailCustomRole,
    openDetailRoleEdit,
    saveDetailRole,
    saveCurrentProfile,
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
