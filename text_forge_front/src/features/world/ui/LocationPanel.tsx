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
import type { Location } from '@/types';

const LOCATION_TYPES = [
  { value: 'continent', label: '大陆' },
  { value: 'region', label: '区域' },
  { value: 'city', label: '城市' },
  { value: 'building', label: '建筑' },
  { value: 'natural', label: '自然' },
  { value: 'other', label: '其他' },
];

interface LocationPanelProps {
  bookId: number;
}

export function LocationPanel({ bookId }: LocationPanelProps) {
  const locations = useWorldStore((s) => s.locations);
  const load = useWorldStore((s) => s.load);
  const addLocation = useWorldStore((s) => s.addLocation);
  const updateLocationStore = useWorldStore((s) => s.updateLocation);
  const removeLocation = useWorldStore((s) => s.removeLocation);

  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<Partial<Location>>({
    name: '',
    type: 'city',
    description: '',
    parentId: undefined,
    attributes: {},
  });

  useEffect(() => {
    load(bookId).catch(() => {});
  }, [bookId, load]);

  const loadLocations = async () => {
    setLoading(true);
    try {
      await load(bookId);
    } catch {
      toast.error('加载地点失败');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    try {
      await addLocation(bookId, form);
      setDialogOpen(false);
      setForm({ name: '', type: 'city', description: '', parentId: undefined, attributes: {} });
      toast.success('地点已创建');
    } catch {
      toast.error('创建地点失败');
    }
  };

  const handleUpdate = async () => {
    if (editingId === null) return;
    try {
      await updateLocationStore(editingId, form);
      setEditingId(null);
      setDialogOpen(false);
      toast.success('地点已更新');
    } catch {
      toast.error('更新地点失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await removeLocation(id, bookId);
      toast.success('地点已删除');
    } catch {
      toast.error('删除地点失败');
    }
  };

  const openEdit = (loc: Location) => {
    setEditingId(loc.id);
    setForm({
      name: loc.name,
      type: loc.type,
      description: loc.description ?? '',
      parentId: loc.parentId ?? undefined,
      attributes: loc.attributes ?? {},
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ name: '', type: 'city', description: '', parentId: undefined, attributes: {} });
    setDialogOpen(true);
  };

  const parentLocations = locations.filter((l) => !l.parentId);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" />
          新增地点
        </Button>
        <Button size="sm" variant="outline" onClick={loadLocations} disabled={loading}>
          {loading ? '加载中...' : '刷新'}
        </Button>
      </div>

      {locations.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无地点，点击"新增地点"开始创建</p>
      ) : (
        <div className="space-y-2">
          {parentLocations.map((loc) => (
            <div key={loc.id} className="flex items-center gap-3 p-3 border rounded-lg">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{loc.name}</p>
                <p className="text-xs text-muted-foreground">
                  {LOCATION_TYPES.find((t) => t.value === loc.type)?.label ?? loc.type}
                  {loc.parentId ? ` → 父级: ${locations.find((l) => l.id === loc.parentId)?.name ?? loc.parentId}` : ''}
                </p>
                {loc.description && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{loc.description}</p>
                )}
              </div>
              <div className="flex gap-1">
                <Button size="sm" variant="ghost" onClick={() => openEdit(loc)}>
                  <Pencil className="w-3.5 h-3.5" />
                </Button>
                <Button size="sm" variant="ghost" onClick={() => handleDelete(loc.id)}>
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
            <DialogTitle>{editingId !== null ? '编辑地点' : '新增地点'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input value={form.name ?? ''} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>类型</Label>
              <Select value={form.type ?? 'city'} onValueChange={(v) => setForm((p) => ({ ...p, type: v || undefined }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOCATION_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Textarea value={form.description ?? ''} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>父级地点</Label>
              <Select
                value={form.parentId?.toString() ?? ''}
                onValueChange={(v) => setForm((p) => ({ ...p, parentId: v ? Number(v) : undefined }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="无（顶级地点）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">无</SelectItem>
                  {locations.map((l) => (
                    <SelectItem key={l.id} value={String(l.id)}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
