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
import type { Foreshadowing } from '@/types';

const STATUS_OPTIONS = [
  { value: 'planted', label: '已埋下', color: 'gray' },
  { value: 'hinted', label: '已暗示', color: 'blue' },
  { value: 'revealed', label: '已揭示', color: 'orange' },
  { value: 'paid_off', label: '已兑现', color: 'green' },
];

const REVEAL_TYPES = [
  { value: 'direct', label: '直接' },
  { value: 'twist', label: '反转' },
  { value: 'callback', label: '呼应' },
  { value: 'montage', label: '蒙太奇' },
];

interface ForeshadowingPanelProps {
  bookId: number;
}

export function ForeshadowingPanel({ bookId }: ForeshadowingPanelProps) {
  const foreshadowings = useWorldStore((s) => s.foreshadowings);
  const load = useWorldStore((s) => s.load);
  const addForeshadowing = useWorldStore((s) => s.addForeshadowing);
  const updateForeshadowingStore = useWorldStore((s) => s.updateForeshadowing);
  const removeForeshadowing = useWorldStore((s) => s.removeForeshadowing);

  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Partial<Foreshadowing>>({
    description: '',
    status: 'planted',
    revealType: 'direct',
    relatedCharacterIds: [],
  });

  useEffect(() => {
    load(bookId).catch(() => {});
  }, [bookId, load]);

  const loadForeshadowings = async () => {
    setLoading(true);
    try {
      await load(bookId);
    } catch {
      toast.error('加载伏笔失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      await addForeshadowing(bookId, form);
      setDialogOpen(false);
      setForm({ description: '', status: 'planted', revealType: 'direct', relatedCharacterIds: [] });
      toast.success('伏笔已创建');
    } catch {
      toast.error('创建伏笔失败');
    }
  };

  const handleUpdate = async () => {
    if (editingId === null) return;
    try {
      await updateForeshadowingStore(editingId, form);
      setEditingId(null);
      setDialogOpen(false);
      toast.success('伏笔已更新');
    } catch {
      toast.error('更新伏笔失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await removeForeshadowing(id, bookId);
      toast.success('伏笔已删除');
    } catch {
      toast.error('删除伏笔失败');
    }
  };

  const openEdit = (f: Foreshadowing) => {
    setEditingId(f.id);
    setForm({
      description: f.description,
      status: f.status,
      plantedAtChapterId: f.plantedAtChapterId,
      resolvedAtChapterId: f.resolvedAtChapterId,
      relatedCharacterIds: f.relatedCharacterIds ?? [],
      relatedEventId: f.relatedEventId,
      revealType: f.revealType ?? 'direct',
      notes: f.notes ?? '',
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ description: '', status: 'planted', revealType: 'direct', relatedCharacterIds: [] });
    setDialogOpen(true);
  };

  const statusColorMap: Record<string, string> = {
    planted: 'bg-gray-100 text-gray-700',
    hinted: 'bg-blue-100 text-blue-700',
    revealed: 'bg-orange-100 text-orange-700',
    paid_off: 'bg-green-100 text-green-700',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" />
          新增伏笔
        </Button>
        <Button size="sm" variant="outline" onClick={loadForeshadowings} disabled={loading}>
          {loading ? '加载中...' : '刷新'}
        </Button>
      </div>

      {foreshadowings.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无伏笔</p>
      ) : (
        <div className="space-y-2">
          {foreshadowings.map((f) => (
            <div key={f.id} className="flex items-center gap-3 p-3 border rounded-lg">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm">{f.description}</p>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${statusColorMap[f.status] ?? 'bg-gray-100 text-gray-700'}`}>
                    {STATUS_OPTIONS.find((s) => s.value === f.status)?.label ?? f.status}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {REVEAL_TYPES.find((r) => r.value === f.revealType)?.label ?? f.revealType}
                  {f.relatedCharacterIds.length > 0 ? ` | 角色: ${f.relatedCharacterIds.join(', ')}` : ''}
                  {f.relatedEventId != null ? ` | 事件 #${f.relatedEventId}` : ''}
                </p>
                {f.notes && (
                  <p className="text-xs text-muted-foreground mt-1">备注: {f.notes}</p>
                )}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEdit(f)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(f.id)}>
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
            <DialogTitle>{editingId !== null ? '编辑伏笔' : '新增伏笔'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>描述</Label>
              <Textarea value={form.description ?? ''} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>状态</Label>
                <Select value={form.status ?? 'planted'} onValueChange={(v) => setForm((p) => ({ ...p, status: v as Foreshadowing['status'] }))}>
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
              <div className="space-y-2">
                <Label>揭示类型</Label>
                <Select value={form.revealType ?? 'direct'} onValueChange={(v) => setForm((p) => ({ ...p, revealType: v || undefined }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REVEAL_TYPES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>埋下章节 ID</Label>
                <Input type="number" value={form.plantedAtChapterId ?? ''} onChange={(e) => setForm((p) => ({ ...p, plantedAtChapterId: e.target.value ? Number(e.target.value) : undefined }))} />
              </div>
              <div className="space-y-2">
                <Label>收回章节 ID</Label>
                <Input type="number" value={form.resolvedAtChapterId ?? ''} onChange={(e) => setForm((p) => ({ ...p, resolvedAtChapterId: e.target.value ? Number(e.target.value) : undefined }))} />
              </div>
            </div>
            <div className="space-y-2">
              <Label>关联角色 ID（逗号分隔）</Label>
              <Input value={form.relatedCharacterIds?.join(', ') ?? ''} onChange={(e) => {
                const ids = e.target.value.split(',').map((s) => s.trim()).filter(Boolean).map(Number);
                setForm((p) => ({ ...p, relatedCharacterIds: ids }));
              }} />
            </div>
            <div className="space-y-2">
              <Label>关联事件 ID</Label>
              <Input type="number" value={form.relatedEventId ?? ''} onChange={(e) => setForm((p) => ({ ...p, relatedEventId: e.target.value ? Number(e.target.value) : undefined }))} />
            </div>
            <div className="space-y-2">
              <Label>备注</Label>
              <Textarea value={form.notes ?? ''} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} />
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
