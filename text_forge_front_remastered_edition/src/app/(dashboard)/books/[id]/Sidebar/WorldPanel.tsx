'use client';

import { useState } from 'react';
import { useBookDetailStore } from '../store';
import { Lock, MapPin, Clock, Eye, GitBranch, Plus, Trash2, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/cn';
import type { WorldSubTab } from '../types';
import type { Location, TimelineEvent, Foreshadowing, PlotThread } from '@/shared/api/types';
import * as worldApi from '@/shared/api/world';
import * as lockApi from '@/shared/api/lock';

const SUB_TABS: { id: WorldSubTab; label: string; icon: typeof MapPin }[] = [
  { id: 'locations' as const, label: '地点', icon: MapPin },
  { id: 'events' as const, label: '事件', icon: Clock },
  { id: 'foreshadowings' as const, label: '伏笔', icon: Eye },
  { id: 'plot-threads' as const, label: '线索', icon: GitBranch },
];

type WorldItem = Location | TimelineEvent | Foreshadowing | PlotThread;

function getItemLabel(item: WorldItem): string {
  if ('name' in item) return item.name;
  if ('description' in item) return item.description.slice(0, 20);
  return '未命名';
}

export function WorldPanel() {
  const worldSubTab = useBookDetailStore((s) => s.worldSubTab);
  const setWorldSubTab = useBookDetailStore((s) => s.setWorldSubTab);
  const bookId = useBookDetailStore((s) => s.bookId);
  const loadWorld = useBookDetailStore((s) => s.loadWorld);
  const locations = useBookDetailStore((s) => s.locations);
  const timelineEvents = useBookDetailStore((s) => s.timelineEvents);
  const foreshadowings = useBookDetailStore((s) => s.foreshadowings);
  const plotThreads = useBookDetailStore((s) => s.plotThreads);

  const [editingItem, setEditingItem] = useState<WorldItem | null>(null);
  const [editForm, setEditForm] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  const dataMap: Record<WorldSubTab, WorldItem[]> = {
    locations,
    events: timelineEvents,
    foreshadowings,
    'plot-threads': plotThreads,
  };

  const currentData = dataMap[worldSubTab];

  const openCreate = () => {
    setEditingItem(null);
    setEditForm({});
  };

  const openEdit = (item: WorldItem) => {
    setEditingItem(item);
    setEditForm({ ...item });
  };

  const handleSave = async () => {
    if (!bookId || !editingItem) return;
    setSaving(true);
    try {
      if (editingItem.id) {
        await worldApi.updateLocation(editingItem.id, editForm as Partial<Location>);
      }
      await loadWorld();
      setEditingItem(null);
      toast.success('已保存');
    } catch { toast.error('保存失败'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (item: WorldItem) => {
    if (!confirm('确定删除？')) return;
    try {
      if ('name' in item && worldSubTab === 'locations') {
        await worldApi.deleteLocation(item.id, bookId);
      } else if (worldSubTab === 'events') {
        await worldApi.deleteTimelineEvent(item.id, bookId);
      } else if (worldSubTab === 'foreshadowings') {
        await worldApi.deleteForeshadowing(item.id, bookId);
      } else if (worldSubTab === 'plot-threads') {
        await worldApi.deletePlotThread(item.id, bookId);
      }
      await loadWorld();
      toast.success('已删除');
    } catch { toast.error('删除失败'); }
  };

  const handleToggleLock = async (item: WorldItem) => {
    try {
      const entityType = worldSubTab === 'locations' ? 'locations' : worldSubTab === 'events' ? 'timeline_events' : worldSubTab === 'foreshadowings' ? 'foreshadowings' : 'plot_threads';
      await lockApi.toggleLock(entityType, item.id);
      await loadWorld();
      toast.success(item.locked ? '已解锁' : '已锁定');
    } catch { toast.error('操作失败'); }
  };

  return (
    <>
      <div className="ide-sidebar-header">
        {SUB_TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setWorldSubTab(id)}
            className={`text-[11px] px-1.5 py-0.5 rounded cursor-pointer bg-transparent border-none transition-colors ${
              worldSubTab === id ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
        <button onClick={openCreate} className="text-muted-foreground text-xs hover:text-foreground cursor-pointer bg-transparent border-none ml-auto" title="新建">
          <Plus size={14} />
        </button>
      </div>
      <div className="ide-sidebar-body p-1 space-y-0.5">
        {currentData.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 px-2 py-1 rounded-md hover:bg-[var(--sidebar-hover)] cursor-pointer text-[13px]"
            role="button"
            tabIndex={0}
          >
            <span className="flex-1 truncate">{getItemLabel(item)}</span>
            <button
              onClick={(e) => { e.stopPropagation(); openEdit(item); }}
              className="text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer"
            >
              <Pencil size={10} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleToggleLock(item); }}
              className={cn('bg-transparent border-none cursor-pointer', item.locked ? 'text-foreground' : 'text-muted-foreground hover:text-foreground')}
            >
              <Lock size={10} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
              className="text-muted-foreground hover:text-destructive bg-transparent border-none cursor-pointer"
            >
              <Trash2 size={10} />
            </button>
          </div>
        ))}
        {currentData.length === 0 && (
          <div className="text-xs text-muted-foreground p-3 text-center">暂无数据</div>
        )}
      </div>
      <div className="ide-sidebar-footer space-y-0.5">
        <div className="ide-sidebar-stat">
          <span>锁定项</span>
          <span>{currentData.filter((item) => item.locked).length}</span>
        </div>
      </div>

      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/[0.03]" onClick={() => setEditingItem(null)} />
          <div className="relative w-full max-w-md rounded-2xl border border-border/50 bg-card shadow-2xl">
            <div className="flex items-center px-5 h-12 border-b border-border/50">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {editingItem.id ? '编辑' : '新建'}
              </h2>
            </div>
            <div className="p-5 space-y-4">
              {'name' in editingItem && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground">名称</label>
                  <input
                    value={(editForm.name as string) || ''}
                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    className="w-full h-8 px-3 rounded-md text-xs bg-background border border-border focus:outline-none"
                  />
                </div>
              )}
              {'description' in editingItem && (
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-muted-foreground">描述</label>
                  <textarea
                    value={(editForm.description as string) || ''}
                    onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 rounded-md text-xs bg-background border border-border focus:outline-none resize-none"
                  />
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 h-14 border-t border-border/50">
              <button onClick={() => setEditingItem(null)} className="h-7 px-4 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-[var(--sidebar-hover)] bg-transparent border-none cursor-pointer">取消</button>
              <button onClick={handleSave} disabled={saving} className="h-7 px-4 rounded-md text-xs font-medium bg-foreground text-background hover:opacity-90 disabled:opacity-50">{saving ? '保存中...' : '保存'}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
