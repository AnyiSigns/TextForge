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
  const [backgroundUrl, setBackgroundUrl] = useState('');
  const [positionX, setPositionX] = useState('');
  const [positionY, setPositionY] = useState('');
  const [parentId, setParentId] = useState<number>(0);

  useEffect(() => {
    if (isNew) return;
    if (!location) return;
    setName(location.name);
    setType(location.type);
    setDescription(location.description);
    setBackgroundUrl(location.backgroundUrl ?? '');
    setPositionX(location.positionX != null ? String(location.positionX) : '');
    setPositionY(location.positionY != null ? String(location.positionY) : '');
    setParentId(location.parentId ?? 0);
  }, [location, isNew]);

  if (!isNew && !location) return null;

  const parent = !isNew ? locations.find((l) => l.id === location?.parentId) : null;

  const handleSave = () => {
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
        backgroundUrl: backgroundUrl || null,
        alternateOfId: null,
        mapIcon: null,
        attributes: {},
        locked: false,
      });
    } else if (locationId !== null) {
      updateLocation(locationId, {
        name,
        type: type || '地点',
        description,
        parentId: parentId || null,
        backgroundUrl: backgroundUrl || null,
        positionX: positionX ? parseFloat(positionX) : null,
        positionY: positionY ? parseFloat(positionY) : null,
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
            <label className="text-[11px] font-medium text-muted-foreground">父级地点 ID</label>
            <input
              type="number"
              value={parentId || ''}
              onChange={(e) => setParentId(parseInt(e.target.value) || 0)}
              className="w-full h-8 px-3 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
            />
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

      <div className="space-y-1.5">
        <label className="text-[11px] font-medium text-muted-foreground">背景图 URL</label>
        <input
          value={backgroundUrl}
          onChange={(e) => setBackgroundUrl(e.target.value)}
          placeholder="留空使用渐变背景"
          className="w-full h-8 px-3 rounded-md text-sm bg-background border border-border focus:outline-none focus:border-foreground/20"
        />
      </div>

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
