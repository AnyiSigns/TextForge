import { useEffect, useState } from 'react';
import { useWorldStore } from '@/features/world/stores/worldStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Pencil, Trash2, Save, X } from 'lucide-react';
import { toast } from 'sonner';
import type { PlotThread } from '@/types';

const THREAD_TYPES = [
  { value: 'main', label: '主线' },
  { value: 'sub', label: '支线' },
  { value: 'romance', label: '感情' },
  { value: 'mystery', label: '悬疑' },
  { value: 'political', label: '政治' },
];

const STATUS_OPTIONS = [
  { value: 'active', label: '活跃' },
  { value: 'dormant', label: '休眠' },
  { value: 'resolved', label: '已解决' },
  { value: 'abandoned', label: '已放弃' },
];

interface PlotThreadPanelProps {
  bookId: number;
}

export function PlotThreadPanel({ bookId }: PlotThreadPanelProps) {
  const threads = useWorldStore((s) => s.plotThreads);
  const load = useWorldStore((s) => s.load);
  const addThread = useWorldStore((s) => s.addPlotThread);
  const updateThreadStore = useWorldStore((s) => s.updatePlotThread);
  const removeThread = useWorldStore((s) => s.removePlotThread);

  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Partial<PlotThread>>({
    name: '',
    description: '',
    status: 'active',
    type: 'main',
    relatedCharacterIds: [],
  });

  useEffect(() => {
    load(bookId).catch(() => {});
  }, [bookId, load]);

  const loadThreads = async () => {
    setLoading(true);
    try {
      await load(bookId);
    } catch {
      toast.error('加载情节脉络失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      await addThread(bookId, form);
      setDialogOpen(false);
      setForm({ name: '', description: '', status: 'active', type: 'main', relatedCharacterIds: [] });
      toast.success('情节脉络已创建');
    } catch {
      toast.error('创建情节脉络失败');
    }
  };

  const handleUpdate = async () => {
    if (editingId === null) return;
    try {
      await updateThreadStore(editingId, form);
      setEditingId(null);
      setDialogOpen(false);
      toast.success('情节脉络已更新');
    } catch {
      toast.error('更新情节脉络失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await removeThread(id, bookId);
      toast.success('情节脉络已删除');
    } catch {
      toast.error('删除情节脉络失败');
    }
  };

  const openEdit = (t: PlotThread) => {
    setEditingId(t.id);
    setForm({
      name: t.name,
      description: t.description ?? '',
      status: t.status,
      type: t.type,
      parentThreadId: t.parentThreadId,
      relatedCharacterIds: t.relatedCharacterIds ?? [],
      startChapterId: t.startChapterId,
      endChapterId: t.endChapterId,
      progressNote: t.progressNote ?? '',
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', description: '', status: 'active', type: 'main', relatedCharacterIds: [] });
    setDialogOpen(true);
  };

  const parentThreads = threads.filter((t) => !t.parentThreadId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" />
          新增脉络
        </Button>
        <Button size="sm" variant="outline" onClick={loadThreads} disabled={loading}>
          {loading ? '加载中...' : '刷新'}
        </Button>
      </div>

      {threads.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无情节脉络</p>
      ) : (
        <div className="space-y-2">
          {parentThreads.map((t) => (
            <div key={t.id} className="p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {THREAD_TYPES.find((tp) => tp.value === t.type)?.label ?? t.type}
                    {' | '}
                    {STATUS_OPTIONS.find((s) => s.value === t.status)?.label ?? t.status}
                    {t.startChapterId != null ? ` | 起始: 第${t.startChapterId}章` : ''}
                    {t.endChapterId != null ? ` | 结束: 第${t.endChapterId}章` : ''}
                  </p>
                  {t.description && (
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{t.description}</p>
                  )}
                  {t.progressNote && (
                    <p className="text-xs text-muted-foreground mt-1">进展: {t.progressNote}</p>
                  )}
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(t)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(t.id)}>
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId !== null ? '编辑情节脉络' : '新增情节脉络'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input value={form.name ?? ''} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>类型</Label>
                <Select value={form.type ?? 'main'} onValueChange={(v) => setForm((p) => ({ ...p, type: v || undefined }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {THREAD_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>状态</Label>
                <Select value={form.status ?? 'active'} onValueChange={(v) => setForm((p) => ({ ...p, status: v || undefined }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Textarea value={form.description ?? ''} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>父级脉络 ID</Label>
                <Input type="number" value={form.parentThreadId ?? ''} onChange={(e) => setForm((p) => ({ ...p, parentThreadId: e.target.value ? Number(e.target.value) : undefined }))} />
              </div>
              <div className="space-y-2">
                <Label>起始章节 ID</Label>
                <Input type="number" value={form.startChapterId ?? ''} onChange={(e) => setForm((p) => ({ ...p, startChapterId: e.target.value ? Number(e.target.value) : undefined }))} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>结束章节 ID</Label>
                <Input type="number" value={form.endChapterId ?? ''} onChange={(e) => setForm((p) => ({ ...p, endChapterId: e.target.value ? Number(e.target.value) : undefined }))} />
              </div>
              <div className="space-y-2">
                <Label>关联角色 ID（逗号分隔）</Label>
                <Input value={form.relatedCharacterIds?.join(', ') ?? ''} onChange={(e) => {
                  const ids = e.target.value.split(',').map((s) => s.trim()).filter(Boolean).map(Number);
                  setForm((p) => ({ ...p, relatedCharacterIds: ids }));
                }} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>进展描述</Label>
              <Textarea value={form.progressNote ?? ''} onChange={(e) => setForm((p) => ({ ...p, progressNote: e.target.value }))} />
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
