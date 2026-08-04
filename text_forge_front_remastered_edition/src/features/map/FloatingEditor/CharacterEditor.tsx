'use client';

import { useState, useEffect } from 'react';
import { useEntityStore } from '@/features/map/stores/entityStore';

interface CharacterEditorProps {
  characterId: number | null;
  isNew: boolean;
  onClose: () => void;
}

export function CharacterEditor({ characterId, isNew, onClose }: CharacterEditorProps) {
  const characters = useEntityStore((s) => s.characters);
  const updateCharacter = useEntityStore((s) => s.updateCharacter);
  const addCharacter = useEntityStore((s) => s.addCharacter);
  const locations = useEntityStore((s) => s.locations);

  const character = !isNew ? characters.find((c) => c.id === characterId) : null;
  const bookId = useEntityStore((s) => s.book?.id ?? 1);

  const [name, setName] = useState('');
  const [roleType, setRoleType] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('');
  const [baseLocationId, setBaseLocationId] = useState<number>(0);
  const [spawnLocationId, setSpawnLocationId] = useState<number>(0);

  useEffect(() => {
    if (isNew) return;
    if (!character) return;
    setName(character.name);
    setRoleType(character.roleType);
    setDescription(character.description);
    setStatus(character.status);
    setBaseLocationId(character.baseLocationId ?? 0);
    setSpawnLocationId(character.spawnLocationId ?? 0);
  }, [character, isNew]);

  const handleSave = () => {
    if (isNew) {
      const nextId = Math.max(0, ...characters.map((c) => c.id)) + 100;
      addCharacter({
        id: nextId,
        bookId,
        name,
        aliases: [],
        description,
        roleType,
        status: status || '活跃',
        relationshipChain: [],
        locked: false,
        avatarUrl: null,
        role_type: roleType,
        spawnLocationId: spawnLocationId || null,
        baseLocationId: baseLocationId || null,
        customFields: {},
        userId: 1,
      });
    } else if (characterId !== null) {
      updateCharacter(characterId, {
        name,
        roleType,
        description,
        status,
      });
    }
    onClose();
  };

  if (!isNew && !character) return null;

  const spawnLocation = !isNew ? locations.find((l) => l.id === character?.spawnLocationId) : null;
  const baseLocation = !isNew ? locations.find((l) => l.id === character?.baseLocationId) : null;

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">角色名称</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full h-8 px-3 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">角色类型</label>
          <input
            value={roleType}
            onChange={(e) => setRoleType(e.target.value)}
            placeholder="主角/反派/配角"
            className="w-full h-8 px-3 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">状态</label>
          <input
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            placeholder="活跃/沉睡"
            className="w-full h-8 px-3 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
          />
        </div>
      </div>

      {isNew ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">出场地点 ID</label>
            <input
              type="number"
              value={spawnLocationId || ''}
              onChange={(e) => setSpawnLocationId(parseInt(e.target.value) || 0)}
              className="w-full h-8 px-3 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">常驻地 ID</label>
            <input
              type="number"
              value={baseLocationId || ''}
              onChange={(e) => setBaseLocationId(parseInt(e.target.value) || 0)}
              className="w-full h-8 px-3 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
            />
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">出场地点</label>
            <div className="text-sm text-muted-foreground/70 pt-2">
              {spawnLocation?.name ?? '未设置'}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">常驻地</label>
            <div className="text-sm text-muted-foreground/70 pt-2">
              {baseLocation?.name ?? '未设置'}
            </div>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">角色描述</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          className="w-full px-3 py-2 rounded-md text-sm leading-relaxed bg-background border border-border focus:outline-none focus:border-foreground/20 resize-none"
          placeholder="输入角色描述..."
        />
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <button
          onClick={onClose}
          className="h-8 px-4 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/5 bg-transparent border-none cursor-pointer transition-colors"
        >
          取消
        </button>
        <button
          onClick={handleSave}
          className="h-8 px-4 rounded-md text-xs font-medium bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer"
        >
          {isNew ? '创建' : '保存'}
        </button>
      </div>
    </div>
  );
}
