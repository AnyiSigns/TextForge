// src/components/projects/ProjectCharactersTab.tsx
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState, Spinner } from '@/components/shared/states';
import { CHARACTER_ROLE_LABELS, characterRoleLabel } from '@/lib/workflow/agentRoles';
import { Plus, Search, Users, UserPlus, Sparkles, List, LayoutGrid } from 'lucide-react';
import { Character, CharacterRole } from '@/types';
import { useProjectCharactersTab } from '@/features/projects';
import { CharacterCard, type CharacterCardActions } from './CharacterCard';
import { CharacterDetailSheet } from './CharacterDetailSheet';
import { CharacterStatusSheet } from './CharacterStatusSheet';
import { CharacterRelationsSheet } from './CharacterRelationsSheet';
import { CharacterStudioSheet } from '@/components/characters/CharacterStudioSheet';

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
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs ${color}`}>
      {status}
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
  const {
    projectChars, characters, filtered, isLoading, searchTerm, setSearchTerm, viewMode, setViewMode,
    editingId, setEditingId, editName, setEditName, editDesc, setEditDesc, editRole, setEditRole,
    editCustomRole, setEditCustomRole, startEdit, saveEdit,
    relTarget, setRelTarget, relDraft, openRelations, addRelation, updateRelation, removeRelation, applyRelations,
    charNameById, statusTarget, setStatusTarget, statusDraft, setStatusDraft, openStatus, applyStatus,
    detailChar, setDetailChar, detailRole, setDetailRole, detailCustomRole, setDetailCustomRole,
    openDetailRoleEdit, saveDetailRole, saveCurrentProfile, saveAliases, toggleReferenceImage, exportImages,
    avatarInputRefs, handleAvatarChange, isSeedingChars, handleSeedChars, handleDelete, studioTarget, setStudioTarget,
  } = useProjectCharactersTab(projectId);

  if (isLoading) {
    return <Spinner label="正在加载角色..." />;
  }

  const cardActions: CharacterCardActions = {
    onRelations: openRelations,
    onStudio: setStudioTarget,
    onStatus: openStatus,
    onDetail: setDetailChar,
    onEdit: startEdit,
    onDelete: handleDelete,
    onAvatarChange: handleAvatarChange,
    onUploadClick: (id) => avatarInputRefs.current[id]?.click(),
    avatarInputRefs,
  };

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
            <CharacterCard
              key={char.id}
              char={char}
              isEditing={editingId === char.id}
              editName={editName}
              editDesc={editDesc}
              editRole={editRole}
              editCustomRole={editCustomRole}
              viewMode="list"
              onName={setEditName}
              onDesc={setEditDesc}
              onRole={setEditRole}
              onCustomRole={setEditCustomRole}
              onSaveEdit={saveEdit}
              onCancelEdit={() => setEditingId(null)}
              rolePresets={ROLE_PRESETS}
              roleLabel={roleLabel}
              statusBadge={statusBadge}
              actions={cardActions}
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 stagger">
          {filtered.map((char) => (
            <CharacterCard
              key={char.id}
              char={char}
              isEditing={editingId === char.id}
              editName={editName}
              editDesc={editDesc}
              editRole={editRole}
              editCustomRole={editCustomRole}
              viewMode="grid"
              onName={setEditName}
              onDesc={setEditDesc}
              onRole={setEditRole}
              onCustomRole={setEditCustomRole}
              onSaveEdit={saveEdit}
              onCancelEdit={() => setEditingId(null)}
              rolePresets={ROLE_PRESETS}
              roleLabel={roleLabel}
              statusBadge={statusBadge}
              actions={cardActions}
            />
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button asChild variant="outline" size="sm">
          <Link href={`/characters/create?projectId=${projectId}`}>
            <Plus className="w-4 h-4 mr-2" /> 新建本项目角色
          </Link>
        </Button>
      </div>

      <CharacterDetailSheet
        detailChar={detailChar}
        detailRole={detailRole}
        detailCustomRole={detailCustomRole}
        charNameById={charNameById}
        rolePresets={ROLE_PRESETS}
        roleLabel={roleLabel}
        statusBadge={statusBadge}
        onOpenStatus={openStatus}
        onOpenDetailRoleEdit={openDetailRoleEdit}
        onDetailRole={setDetailRole}
        onDetailCustomRole={setDetailCustomRole}
        onSaveDetailRole={saveDetailRole}
        onSaveCurrentProfile={saveCurrentProfile}
        onSaveAliases={saveAliases}
        onOpenRelations={openRelations}
        onSetDetailChar={setDetailChar}
        toggleReferenceImage={toggleReferenceImage}
        exportImages={exportImages}
      />

      <CharacterStatusSheet
        statusTarget={statusTarget}
        statusDraft={statusDraft}
        onStatusDraft={setStatusDraft}
        onApplyStatus={applyStatus}
        onSetStatusTarget={setStatusTarget}
      />

      <CharacterRelationsSheet
        relTarget={relTarget}
        relDraft={relDraft}
        projectChars={projectChars}
        onTargetChange={updateRelation}
        onRemoveRelation={removeRelation}
        onAddRelation={addRelation}
        onApplyRelations={applyRelations}
        onSetRelTarget={setRelTarget}
      />

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
