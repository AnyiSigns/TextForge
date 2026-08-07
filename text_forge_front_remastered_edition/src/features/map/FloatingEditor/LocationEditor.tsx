'use client';

import { useState, useEffect } from 'react';
import { useEntityStore } from '@/features/map/stores/entityStore';

interface LocationEditorProps {
  locationId: number | null;
  isNew: boolean;
  onClose: () => void;
}

export function LocationEditor({ locationId, isNew, onClose }: LocationEditorProps) {
  const locations = useEntityStore((s) => s.locations);
  const updateLocation = useEntityStore((s) => s.updateLocation);
  const addLocation = useEntityStore((s) => s.addLocation);
  const bookId = useEntityStore((s) => s.book?.id ?? 1);

  const location = !isNew ? locations.find((l) => l.id === locationId) : null;

  const [name, setName] = useState('');
  const [type, setType] = useState('');
  const [description, setDescription] = useState('');
  const [positionX, setPositionX] = useState('');
  const [positionY, setPositionY] = useState('');
  const [parentId, setParentId] = useState<number>(0);
  const [attributes, setAttributes] = useState<{ key: string; value: string }[]>([]);
  const [alternateOfId, setAlternateOfId] = useState<number>(0);
  const [mapIcon, setMapIcon] = useState('');
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (isNew) return;
    if (!location) return;
    setName(location.name);
    setType(location.type);
    setDescription(location.description);
    setPositionX(location.positionX != null ? String(location.positionX) : '');
    setPositionY(location.positionY != null ? String(location.positionY) : '');
    setParentId(location.parentId ?? 0);
    setAttributes(Object.entries(location.attributes ?? {}).map(([key, value]) => ({ key, value: String(value) })));
    setAlternateOfId(location.alternateOfId ?? 0);
    setMapIcon(location.mapIcon ?? '');
    setLocked(!!location.locked);
  }, [location, isNew]);

  if (!isNew && !location) return null;

  const parent = !isNew ? locations.find((l) => l.id === location?.parentId) : null;

  const handleSave = () => {
    const attrs = Object.fromEntries(
      attributes.filter((a) => a.key.trim()).map((a) => [a.key.trim(), a.value]),
    );
    if (isNew) {
      const nextId = Math.max(0, ...locations.map((l) => l.id)) + 100;
      addLocation({
        id: nextId,
        bookId,
        name,
        type: type || '地点',
        description,
        parentId: parentId || null,
        positionX: positionX ? parseFloat(positionX) : null,
        positionY: positionY ? parseFloat(positionY) : null,
        alternateOfId: alternateOfId || null,
        mapIcon: mapIcon || null,
        attributes: attrs,
        locked,
      });
    } else if (locationId !== null) {
      updateLocation(locationId, {
        name,
        type: type || '地点',
        description,
        parentId: parentId || null,
        positionX: positionX ? parseFloat(positionX) : null,
        positionY: positionY ? parseFloat(positionY) : null,
        alternateOfId: alternateOfId || null,
        mapIcon: mapIcon || null,
        attributes: attrs,
        locked,
      });
    }
    onClose();
  };

  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">地点名称</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full h-8 px-3 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
        />
      </div>

      {isNew ? (
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">地点类型</label>
            <input
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="w-full h-8 px-3 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-muted-foreground">父级地点</label>
            <select
              value={parentId || ''}
              onChange={(e) => setParentId(e.target.value ? parseInt(e.target.value) : 0)}
              className="w-full h-8 px-2 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
            >
              <option value="">根节点（大陆/世界级）</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">地点类型</label>
              <input
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="w-full h-8 px-3 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">父级地点</label>
              <select
                value={parentId || ''}
                onChange={(e) => setParentId(e.target.value ? parseInt(e.target.value) : 0)}
                className="w-full h-8 px-2 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
              >
                <option value="">根节点</option>
                {locations.filter((l) => !isNew || l.id !== locationId).map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">X 坐标 (0-1)</label>
              <input
                value={positionX}
                onChange={(e) => setPositionX(e.target.value)}
                placeholder="0.5"
                className="w-full h-8 px-3 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20 font-mono tabular-nums"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">Y 坐标 (0-1)</label>
              <input
                value={positionY}
                onChange={(e) => setPositionY(e.target.value)}
                placeholder="0.5"
                className="w-full h-8 px-3 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20 font-mono tabular-nums"
              />
            </div>
          </div>
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">地图图标</label>
          <input
            value={mapIcon}
            onChange={(e) => setMapIcon(e.target.value)}
            placeholder="如 🏰 或 emoji"
            className="w-full h-8 px-3 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-[11px] font-medium text-muted-foreground">替代地点（平行世界）</label>
          <select
            value={alternateOfId || ''}
            onChange={(e) => setAlternateOfId(e.target.value ? parseInt(e.target.value) : 0)}
            className="w-full h-8 px-2 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
          >
            <option value="">无（独立地点）</option>
            {locations.filter((l) => l.id !== locationId).map((l) => (
              <option key={l.id} value={l.id}>{l.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">属性</label>
        <div className="space-y-1">
          {attributes.map((a, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                value={a.key}
                onChange={(e) => setAttributes(attributes.map((x, j) => (j === i ? { ...x, key: e.target.value } : x)))}
                placeholder="键（如 人口）"
                className="w-1/3 h-7 px-2 rounded-md text-[11px] bg-background border border-border focus:outline-none focus:border-foreground/20"
              />
              <input
                value={a.value}
                onChange={(e) => setAttributes(attributes.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
                placeholder="值"
                className="flex-1 h-7 px-2 rounded-md text-[11px] bg-background border border-border focus:outline-none focus:border-foreground/20"
              />
              <button
                onClick={() => setAttributes(attributes.filter((_, j) => j !== i))}
                className="w-6 h-6 shrink-0 grid place-items-center rounded text-muted-foreground/50 hover:text-destructive bg-transparent border-none cursor-pointer"
                title="删除属性"
              >
                ×
              </button>
            </div>
          ))}
          <button
            onClick={() => setAttributes([...attributes, { key: '', value: '' }])}
            className="h-7 px-2.5 rounded-md text-[11px] text-muted-foreground hover:text-foreground hover:bg-foreground/5 bg-transparent border border-dashed border-border/60 cursor-pointer transition-colors"
          >
            + 添加属性
          </button>
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={locked}
          onChange={(e) => setLocked(e.target.checked)}
          className="w-3 h-3 rounded border-border"
        />
        <span className="text-[11px] text-muted-foreground">锁定此地点（防止被 AI 修改）</span>
      </label>

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">地点描述</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full px-3 py-2 rounded-md text-sm leading-relaxed bg-background border border-border focus:outline-none focus:border-foreground/20 resize-none"
          placeholder="输入地点描述..."
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
