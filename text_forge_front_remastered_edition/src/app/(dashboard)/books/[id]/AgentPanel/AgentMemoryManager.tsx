'use client';

import { useState, useEffect } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import * as agentMemoryApi from '@/shared/api/agentMemory';
import type { AgentMemory } from '@/shared/api/types';

interface AgentMemoryManagerProps {
  bookId: number;
  onClose: () => void;
}

export function AgentMemoryManager({ bookId, onClose }: AgentMemoryManagerProps) {
  const [memories, setMemories] = useState<AgentMemory[]>([]);
  const [loading, setLoading] = useState(true);
  const [newContent, setNewContent] = useState('');
  const [newType, setNewType] = useState('note');
  const [saving, setSaving] = useState(false);

  const loadMemories = async () => {
    setLoading(true);
    try {
      const data = await agentMemoryApi.fetchAgentMemories(bookId);
      setMemories(data);
    } catch { toast.error('加载记忆失败'); }
    finally { setLoading(false); }
  };

  useEffect(() => { void loadMemories(); }, [bookId]);

  const handleCreate = async () => {
    if (!newContent.trim()) return;
    setSaving(true);
    try {
      await agentMemoryApi.createAgentMemory({
        bookId,
        memoryType: newType,
        content: newContent.trim(),
        relatedCharacterIds: [],
        priority: 0,
        source: 'manual',
      });
      setNewContent('');
      await loadMemories();
      toast.success('记忆已创建');
    } catch { toast.error('创建失败'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      await agentMemoryApi.deleteAgentMemory(id);
      setMemories((prev) => prev.filter((m) => m.id !== id));
      toast.success('已删除');
    } catch { toast.error('删除失败'); }
  };

  return (
    <div className="fixed inset-0 z-50 bg-background/80 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl border border-border/50 bg-card shadow-2xl">
        <div className="flex items-center justify-between px-5 h-12 border-b border-border/50 shrink-0">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Agent 记忆管理</span>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer">
            <X size={14} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {loading && <div className="text-xs text-muted-foreground text-center py-4">加载中...</div>}
          {!loading && memories.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-4">暂无记忆</div>
          )}
          {memories.map((m) => (
            <div key={m.id} className="flex items-start gap-3 p-3 rounded-lg border border-border bg-background">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">{m.memoryType}</span>
                  <span className="text-[10px] text-muted-foreground">{m.source}</span>
                </div>
                <div className="text-sm whitespace-pre-wrap">{m.content}</div>
              </div>
              <button onClick={() => handleDelete(m.id)} className="text-muted-foreground hover:text-destructive bg-transparent border-none cursor-pointer shrink-0">
                <Trash2 size={12} />
              </button>
            </div>
          ))}
          <div className="pt-3 border-t border-border space-y-2">
            <div className="flex items-center gap-2">
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="h-8 px-2 rounded-md text-xs bg-background border border-border focus:outline-none"
              >
                <option value="note">笔记</option>
                <option value="character">角色记忆</option>
                <option value="plot">情节记忆</option>
                <option value="world">世界记忆</option>
              </select>
              <input
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                placeholder="输入记忆内容..."
                className="flex-1 h-8 px-3 rounded-md text-xs bg-background border border-border focus:outline-none"
              />
              <button onClick={handleCreate} disabled={saving || !newContent.trim()} className="h-8 px-3 rounded-md bg-foreground text-background text-xs font-medium border-none cursor-pointer hover:opacity-90 disabled:opacity-50">
                <Plus size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
