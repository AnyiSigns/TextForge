'use client';

import { useState, useEffect } from 'react';
import { Plus, X } from 'lucide-react';
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
  const [avatarUrl, setAvatarUrl] = useState('');
  const [aliases, setAliases] = useState<string[]>([]);
  const [aliasInput, setAliasInput] = useState('');
  const [customFieldKey, setCustomFieldKey] = useState('');
  const [customFieldValue, setCustomFieldValue] = useState('');
  const [relationshipChain, setRelationshipChain] = useState<Array<{ targetId: number; type: string; description: string }>>([]);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>({});
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (isNew) return;
    if (!character) return;
    setName(character.name);
    setRoleType(character.roleType);
    setDescription(character.description);
    setStatus(character.status);
    setBaseLocationId(character.baseLocationId ?? 0);
    setSpawnLocationId(character.spawnLocationId ?? 0);
    setAvatarUrl(character.avatarUrl ?? '');
    setAliases(character.aliases || []);
    setRelationshipChain(character.relationshipChain || []);
    setCustomFields(character.customFields || {});
    setLocked(character.locked || false);
  }, [character, isNew]);

  const handleSave = () => {
    if (isNew) {
      const nextId = Math.max(0, ...characters.map((c) => c.id)) + 100;
      addCharacter({
        id: nextId,
        bookId,
        name,
        aliases: aliases,
        description,
        roleType,
        status: status || '活跃',
        relationshipChain: relationshipChain,
        locked,
        avatarUrl: avatarUrl || null,
        spawnLocationId: spawnLocationId || null,
        baseLocationId: baseLocationId || null,
        customFields,
      });
    } else if (characterId !== null) {
      updateCharacter(characterId, {
        name,
        roleType,
        description,
        status,
        avatarUrl: avatarUrl || null,
        aliases,
        relationshipChain,
        customFields,
        locked,
        spawnLocationId: spawnLocationId || null,
        baseLocationId: baseLocationId || null,
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

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">首次出场地点</label>
          <select
            value={spawnLocationId || ''}
            onChange={(e) => setSpawnLocationId(e.target.value ? parseInt(e.target.value) : 0)}
            className="w-full h-8 px-2 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
          >
            <option value="">未设置</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">当前所在地点</label>
          <select
            value={baseLocationId || ''}
            onChange={(e) => setBaseLocationId(e.target.value ? parseInt(e.target.value) : 0)}
            className="w-full h-8 px-2 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
          >
            <option value="">未设置</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
      </div>

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

      <div className="space-y-2">
        <label className="text-[11px] font-medium text-muted-foreground">关系</label>
        {relationshipChain.map((rel, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <select
              value={rel.targetId}
              onChange={(e) => {
                const next = [...relationshipChain];
                next[i] = { ...next[i], targetId: parseInt(e.target.value) || 0 };
                setRelationshipChain(next);
              }}
              className="flex-1 h-7 px-1.5 rounded text-[11px] bg-background border border-border focus:outline-none focus:border-foreground/20"
            >
              <option value={0}>选择目标角色</option>
              {characters
                .filter((c) => isNew || c.id !== characterId)
                .map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
            <input
              value={rel.type}
              onChange={(e) => {
                const next = [...relationshipChain];
                next[i] = { ...next[i], type: e.target.value };
                setRelationshipChain(next);
              }}
              placeholder="关系类型"
              className="w-20 h-7 px-1.5 rounded text-[11px] bg-background border border-border focus:outline-none focus:border-foreground/20"
            />
            <input
              value={rel.description}
              onChange={(e) => {
                const next = [...relationshipChain];
                next[i] = { ...next[i], description: e.target.value };
                setRelationshipChain(next);
              }}
              placeholder="描述"
              className="flex-1 h-7 px-1.5 rounded text-[11px] bg-background border border-border focus:outline-none focus:border-foreground/20"
            />
            <button
              onClick={() => setRelationshipChain(relationshipChain.filter((_, j) => j !== i))}
              className="w-5 h-5 flex items-center justify-center rounded text-muted-foreground/40 hover:text-destructive bg-transparent border-none cursor-pointer"
            >
              <X size={10} />
            </button>
          </div>
        ))}
        <button
          onClick={() => setRelationshipChain([...relationshipChain, { targetId: 0, type: '', description: '' }])}
          className="flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-foreground/60 bg-transparent border-none cursor-pointer transition-colors"
        >
          <Plus size={10} />
          添加关系
        </button>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">头像 URL</label>
        <input
          value={avatarUrl}
          onChange={(e) => setAvatarUrl(e.target.value)}
          className="w-full h-8 px-3 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
          placeholder="https://..."
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">别名</label>
        <div className="flex flex-wrap gap-1 mb-1">
          {aliases.map((a, i) => (
            <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] bg-foreground/[0.06] text-foreground/70">
              {a}
              <button onClick={() => setAliases(aliases.filter((_, j) => j !== i))} className="w-3 h-3 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-muted-foreground/50 hover:text-destructive">
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-1">
          <input
            value={aliasInput}
            onChange={(e) => setAliasInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && aliasInput.trim()) { setAliases([...aliases, aliasInput.trim()]); setAliasInput(''); e.preventDefault(); } }}
            className="flex-1 h-7 px-2 rounded-md text-xs bg-background border border-border focus:outline-none"
            placeholder="输入后按 Enter 添加"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <label className="text-[11px] font-medium text-muted-foreground">自定义字段</label>
          <button
            onClick={() => {
              if (customFieldKey.trim()) {
                setCustomFields({ ...customFields, [customFieldKey.trim()]: customFieldValue });
                setCustomFieldKey('');
                setCustomFieldValue('');
              }
            }}
            className="text-[10px] text-muted-foreground/50 hover:text-foreground/60 bg-transparent border-none cursor-pointer"
          >
            + 添加
          </button>
        </div>
        {Object.keys(customFields).length > 0 && (
          <div className="space-y-1 mb-1">
            {Object.entries(customFields).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1">
                <span className="text-[10px] font-medium text-muted-foreground/60 w-[80px] truncate flex-shrink-0">{k}</span>
                <span className="flex-1 text-[10px] text-foreground/60 truncate">{String(v)}</span>
                <button
                  onClick={() => {
                    const next = { ...customFields };
                    delete next[k];
                    setCustomFields(next);
                  }}
                  className="w-4 h-4 flex items-center justify-center rounded text-muted-foreground/30 hover:text-destructive bg-transparent border-none cursor-pointer"
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
        <div className="flex gap-1">
          <input
            value={customFieldKey}
            onChange={(e) => setCustomFieldKey(e.target.value)}
            className="w-[80px] h-7 px-2 rounded-md text-xs bg-background border border-border focus:outline-none flex-shrink-0"
            placeholder="键"
          />
          <input
            value={customFieldValue}
            onChange={(e) => setCustomFieldValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && customFieldKey.trim()) {
                setCustomFields({ ...customFields, [customFieldKey.trim()]: customFieldValue });
                setCustomFieldKey('');
                setCustomFieldValue('');
                e.preventDefault();
              }
            }}
            className="flex-1 h-7 px-2 rounded-md text-xs bg-background border border-border focus:outline-none"
            placeholder="值 (Enter 添加)"
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          <label className="text-[11px] font-medium text-muted-foreground">锁定</label>
          <input type="checkbox" checked={locked} onChange={(e) => setLocked(e.target.checked)} className="w-3 h-3" />
        </div>
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
