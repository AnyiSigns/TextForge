'use client';

import { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, Search } from 'lucide-react';
import { toast } from 'sonner';
import * as agentMemoryApi from '@/shared/api/agentMemory';
import * as agentApi from '@/shared/api/agent';
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
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<AgentMemory[] | null>(null);
  const [searching, setSearching] = useState(false);
  // 2.7：分页状态（page + has_next 驱动「加载更多」）
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loadMemories = async (targetPage = 1, append = false) => {
    setLoading(targetPage === 1);
    if (append) setLoadingMore(true);
    try {
      const data = await agentMemoryApi.fetchAgentMemories(bookId, targetPage);
      setMemories((prev) => (append ? [...prev, ...data.items] : data.items));
      setHasNext(data.has_next);
      setPage(targetPage);
    } catch { toast.error('加载记忆失败'); }
    finally { setLoading(false); setLoadingMore(false); }
  };

  // 2.7：书籍切换/首次挂载统一走 [bookId] effect（整页替换，天然处理切换重置）
  useEffect(() => {
    let alive = true;
    // setState 放微任务，规避 react-hooks/set-state-in-effect 同步 setState 告警
    queueMicrotask(() => { if (alive) setLoading(true); });
    agentMemoryApi.fetchAgentMemories(bookId, 1)
      .then((data) => { if (alive) { setMemories(data.items); setHasNext(data.has_next); setPage(1); } })
      .catch(() => toast.error('加载记忆失败'))
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [bookId]);

  const loadMore = async () => {
    if (loadingMore || !hasNext) return;
    await loadMemories(page + 1, true);
  };

  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const results = await agentApi.searchAgentMemories(bookId, searchQuery.trim());
      setSearchResults(results);
    } catch { toast.error('搜索失败'); }
    finally { setSearching(false); }
  }, [bookId, searchQuery]);

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

        <div className="px-5 py-2 border-b border-border/30 flex items-center gap-2">
          <div className="relative flex-1">
            <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground/30" />
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSearch(); }}
              placeholder="搜索记忆..."
              className="w-full h-7 pl-6 pr-2 rounded-md text-[11px] bg-background border border-border focus:outline-none focus:border-foreground/20"
            />
          </div>
          <button
            onClick={handleSearch}
            disabled={searching || !searchQuery.trim()}
            className="h-7 px-3 rounded-md text-[11px] bg-foreground text-background border-none cursor-pointer disabled:opacity-50"
          >
            {searching ? '搜索中...' : '搜索'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {searchResults !== null && (
            <div className="mb-3 p-3 rounded-lg bg-foreground/[0.03] border border-border/30">
              <div className="text-[11px] font-medium text-muted-foreground mb-2">搜索结果 ({searchResults.length})</div>
              {searchResults.length === 0 ? (
                <div className="text-[11px] text-muted-foreground/50">无结果</div>
              ) : (
                searchResults.map((r, i) => (
                  <div key={i} className="text-[11px] text-foreground/70 leading-relaxed mb-2 pb-2 border-b border-border/20 last:border-0 last:mb-0 last:pb-0">
                    <span className="text-[10px] text-muted-foreground/50 mr-2">{r.memoryType}</span>
                    {r.content}
                  </div>
                ))
              )}
              <button
                onClick={() => setSearchResults(null)}
                className="text-[10px] text-muted-foreground/50 hover:text-foreground/60 bg-transparent border-none cursor-pointer mt-2"
              >
                清除搜索结果
              </button>
            </div>
          )}

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
          {/* 2.7：分页「加载更多」（后端 PageResult.has_next） */}
          {hasNext && (
            <div className="flex justify-center">
              <button
                onClick={() => { void loadMore(); }}
                disabled={loadingMore}
                className="text-[11px] px-3 py-1 rounded-md border border-border bg-transparent text-muted-foreground hover:text-foreground hover:border-foreground/30 cursor-pointer disabled:opacity-50"
              >
                {loadingMore ? '加载中...' : '加载更多'}
              </button>
            </div>
          )}
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
