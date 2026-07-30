import { useState, useEffect } from 'react';
import { useMemoryStore } from '@/features/settings/stores/memoryStore';
import { fetchMemories, createMemory, updateMemory, deleteMemory, searchMemories } from '@/features/settings/api/memory';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Pencil, Trash2, Save, X, Search } from 'lucide-react';
import { toast } from 'sonner';
import type { AgentMemory } from '@/types';

const MEMORY_TYPES = [
  { value: 'preference', label: '偏好' },
  { value: 'rule', label: '规则' },
  { value: 'fact', label: '事实' },
  { value: 'user_manual', label: '用户手动' },
  { value: 'agent_self_reflection', label: 'Agent 反思' },
];

interface MemorySettingsProps {
  bookId?: number;
}

export function MemorySettings({ bookId }: MemorySettingsProps) {
  const memories = useMemoryStore((s) => s.memories);
  const setMemories = useMemoryStore((s) => s.setMemories);
  const addMemory = useMemoryStore((s) => s.addMemory);
  const updateMemoryStore = useMemoryStore((s) => s.updateMemory);
  const removeMemory = useMemoryStore((s) => s.removeMemory);

  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [memoryTypeFilter, setMemoryTypeFilter] = useState<string>('');
  const [searchMode, setSearchMode] = useState<'fulltext' | 'semantic'>('fulltext');
  const [form, setForm] = useState<Partial<AgentMemory>>({
    memoryType: 'preference',
    content: '',
    priority: 5,
    relatedCharacterIds: [],
  });

  const loadMemories = async () => {
    setLoading(true);
    try {
      const data = await fetchMemories(bookId, memoryTypeFilter || undefined);
      setMemories(data);
    } catch {
      toast.error('加载记忆失败');
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadMemories();
      return;
    }
    try {
      const data = await searchMemories(searchQuery, bookId, memoryTypeFilter || undefined);
      setMemories(data);
    } catch {
      toast.error('搜索失败');
    }
  };

  const handleCreate = async () => {
    try {
      const created = await createMemory({
        ...form,
        bookId,
        source: 'user_manual',
      });
      addMemory(created);
      setDialogOpen(false);
      setForm({ memoryType: 'preference', content: '', priority: 5, relatedCharacterIds: [] });
      toast.success('记忆已创建');
    } catch {
      toast.error('创建记忆失败');
    }
  };

  const handleUpdate = async () => {
    if (editingId === null) return;
    try {
      await updateMemory(editingId, form);
      updateMemoryStore(editingId, form);
      setEditingId(null);
      setDialogOpen(false);
      toast.success('记忆已更新');
    } catch {
      toast.error('更新记忆失败');
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await deleteMemory(id);
      removeMemory(id);
      toast.success('记忆已删除');
    } catch {
      toast.error('删除记忆失败');
    }
  };

  const openEdit = (m: AgentMemory) => {
    setEditingId(m.id);
    setForm({
      memoryType: m.memoryType,
      content: m.content,
      priority: m.priority,
      relatedChapterId: m.relatedChapterId,
      relatedCharacterIds: m.relatedCharacterIds ?? [],
    });
    setDialogOpen(true);
  };

  const openCreate = () => {
    setEditingId(null);
    setForm({ memoryType: 'preference', content: '', priority: 5, relatedCharacterIds: [] });
    setDialogOpen(true);
  };

  useEffect(() => { loadMemories(); }, [bookId, memoryTypeFilter]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="搜索记忆内容..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="pl-9"
          />
        </div>
        <Select value={memoryTypeFilter} onValueChange={(v) => setMemoryTypeFilter(v || '')}>
          <SelectTrigger className="w-36">
            <SelectValue placeholder="全部类型" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">全部类型</SelectItem>
            {MEMORY_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={() => setSearchMode(searchMode === 'fulltext' ? 'semantic' : 'fulltext')}>
          {searchMode === 'fulltext' ? '全文搜索' : '语义搜索'}
        </Button>
        <Button size="sm" onClick={openCreate}>
          <Plus className="w-4 h-4 mr-1" />
          新增记忆
        </Button>
        <Button size="sm" variant="outline" onClick={loadMemories} disabled={loading}>
          {loading ? '加载中...' : '刷新'}
        </Button>
      </div>

      {memories.length === 0 ? (
        <p className="text-sm text-muted-foreground">暂无记忆</p>
      ) : (
        <div className="space-y-2">
          {memories.map((m) => (
            <div key={m.id} className="p-3 border rounded-lg">
              <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                      {MEMORY_TYPES.find((t) => t.value === m.memoryType)?.label ?? m.memoryType}
                    </span>
                    <span className="text-xs text-muted-foreground">优先级 {m.priority}</span>
                    <span className="text-xs text-muted-foreground">来源: {m.source}</span>
                  </div>
                  <p className="text-sm mt-1">{m.content}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {m.relatedCharacterIds.length > 0 && `角色: ${m.relatedCharacterIds.join(', ')}`}
                    {m.relatedChapterId && ` | 章节: #${m.relatedChapterId}`}
                    {` | 更新: ${new Date(m.updatedAt).toLocaleDateString()}`}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => openEdit(m)}>
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => handleDelete(m.id)}>
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
            <DialogTitle>{editingId !== null ? '编辑记忆' : '新增记忆'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>记忆类型</Label>
              <Select value={form.memoryType ?? 'preference'} onValueChange={(v) => setForm((p) => ({ ...p, memoryType: v as AgentMemory['memoryType'] }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MEMORY_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>内容</Label>
              <Textarea value={form.content ?? ''} onChange={(e) => setForm((p) => ({ ...p, content: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>优先级: {form.priority ?? 5}</Label>
              <Input type="range" min={1} max={10} value={form.priority ?? 5} onChange={(e) => setForm((p) => ({ ...p, priority: parseInt(e.target.value) }))} />
            </div>
            <div className="space-y-2">
              <Label>关联章节 ID</Label>
              <Input type="number" value={form.relatedChapterId ?? ''} onChange={(e) => setForm((p) => ({ ...p, relatedChapterId: e.target.value ? Number(e.target.value) : undefined }))} />
            </div>
            <div className="space-y-2">
              <Label>关联角色 ID（逗号分隔）</Label>
              <Input value={form.relatedCharacterIds?.join(', ') ?? ''} onChange={(e) => {
                const ids = e.target.value.split(',').map((s) => s.trim()).filter(Boolean).map(Number);
                setForm((p) => ({ ...p, relatedCharacterIds: ids }));
              }} />
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