import { useState } from 'react';
import { useWorldStore } from '@/features/world/stores/worldStore';
import { fetchTimelineEvents, createTimelineEvent, updateTimelineEvent, deleteTimelineEvent } from '@/features/world/api/timeline';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Pencil, Trash2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import type { TimelineEvent } from '@/types';

const EVENT_TYPES = [
  { value: 'backstory', label: '背景故事' },
  { value: 'major', label: '重大事件' },
  { value: 'minor', label: '次要事件' },
  { value: 'reveal', label: '揭示' },
];

interface TimelinePanelProps {
  bookId: number;
}

export function TimelinePanel({ bookId }: TimelinePanelProps) {
  const events = useWorldStore((s) => s.timelineEvents);
  const setEvents = useWorldStore((s) => s.setTimelineEvents);
  const addEvent = useWorldStore((s) => s.addTimelineEvent);
  const updateEventStore = useWorldStore((s) => s.updateTimelineEvent);
  const removeEvent = useWorldStore((s) => s.removeTimelineEvent);

  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Partial<TimelineEvent>>({
    name: '',
    description: '',
    sortOrder: 0,
    eventType: 'major',
    relatedCharacterIds: [],
  });

  const loadEvents = async () => {
    setLoading(true);
    try {
      const data = await fetchTimelineEvents(bookId);
      setEvents(data);
    } catch {
      toast.error('加载时间线事件失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      const created = await createTimelineEvent(bookId, form);
      addEvent(created);
      setDialogOpen(false);
      setForm({ name: '', description: '', sortOrder: 0, eventType: 'major', relatedCharacterIds: [] });
      toast.success('事件已创建');
    } catch {
      toast.error('创建事件失败');
    }
  };

  const handleUpdate = async () => {
    if (editingId === null) return;
    try {
      await updateTimelineEvent(editingId, form);
      updateEventStore(editingId, form);
      setEditingId(null);
      setDialogOpen(false);
      toast.success('事件已更新');
    } catch {
      toast.error('更新事件失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteTimelineEvent(id, bookId);
      removeEvent(id);
      toast.success('事件已删除');
    } catch {
      toast.error('删除事件失败');
    }
  };

  const openEdit = (ev: TimelineEvent) => {
    setEditingId(ev.id);
    setForm({
      name: ev.name,
      description: ev.description ?? '',
      sortOrder: ev.sortOrder,
      chapterId: ev.chapterId,
      eventType: ev.eventType,
      relatedCharacterIds: ev.relatedCharacterIds ?? [],
      relatedLocationId: ev.relatedLocationId,
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', description: '', sortOrder: 0, eventType: 'major', relatedCharacterIds: [] });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" />
          新增事件
        </Button>
        <Button size="sm" variant="outline" onClick={loadEvents} disabled={loading}>
          {loading ? '加载中...' : '刷新'}
        </Button>
      </div>

      {events.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无时间线事件</p>
      ) : (
        <div className="space-y-2">
          {events.sort((a, b) => a.sortOrder - b.sortOrder).map((ev) => (
            <div key={ev.id} className="flex items-center gap-3 p-3 border rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{ev.name}</p>
                <p className="text-xs text-muted-foreground">
                  {EVENT_TYPES.find((t) => t.value === ev.eventType)?.label ?? ev.eventType}
                  {ev.chapterId ? ` | 章节 #${ev.chapterId}` : ''}
                  {ev.relatedLocationId ? ` | 地点 #${ev.relatedLocationId}` : ''}
                </p>
                {ev.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{ev.description}</p>
                )}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEdit(ev)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(ev.id)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId !== null ? '编辑事件' : '新增事件'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input value={form.name ?? ''} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>事件类型</Label>
              <Select value={form.eventType ?? 'major'} onValueChange={(v) => setForm((p) => ({ ...p, eventType: v || undefined }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EVENT_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>时序序号</Label>
              <Input type="number" value={form.sortOrder ?? 0} onChange={(e) => setForm((p) => ({ ...p, sortOrder: parseInt(e.target.value) || 0 }))} />
            </div>
            <div className="space-y-2">
              <Label>关联章节 ID</Label>
              <Input type="number" value={form.chapterId ?? ''} onChange={(e) => setForm((p) => ({ ...p, chapterId: e.target.value ? Number(e.target.value) : undefined }))} />
            </div>
            <div className="space-y-2">
              <Label>关联地点 ID</Label>
              <Input type="number" value={form.relatedLocationId ?? ''} onChange={(e) => setForm((p) => ({ ...p, relatedLocationId: e.target.value ? Number(e.target.value) : undefined }))} />
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Textarea value={form.description ?? ''} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              <X className="w-4 h-4 mr-1" />
              取消
            </Button>
            <Button onClick={editingId !== null ? handleUpdate : handleCreate}>
              <Save className="w-4 h-4 mr-1" />
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}