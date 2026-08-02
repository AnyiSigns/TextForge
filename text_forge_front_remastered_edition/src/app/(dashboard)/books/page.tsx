'use client';

import { useState, useEffect, useMemo } from 'react';
import { cn } from '@/shared/lib/cn';
import Link from 'next/link';
import { BookOpen, Plus, Search, Pin, PinOff, Trash2, ChevronRight, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import * as booksApi from '@/shared/api/books';
import type { Book } from '@/shared/api/types';

export default function BooksListPage() {
  const [books, setBooks] = useState<Book[]>([]);
  const [loading, setLoading] = useState(true);

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [hoveredId, setHoveredId] = useState<number | null>(null);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formGenre, setFormGenre] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formGoal, setFormGoal] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    booksApi.fetchBooks().then((list) => { setBooks(list); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const openNew = () => {
    setEditingId(null);
    setFormTitle('');
    setFormGenre('');
    setFormDesc('');
    setFormGoal('');
    setModalOpen(true);
  };

  const openEdit = (book: Book) => {
    setEditingId(book.id);
    setFormTitle(book.title);
    setFormGenre(book.genre || '');
    setFormDesc(book.description || '');
    setFormGoal(book.totalWordGoal ?? '');
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formTitle.trim()) return;
    setSaving(true);
    try {
      if (editingId !== null) {
        const updated = await booksApi.updateBook(editingId, {
          title: formTitle.trim(),
          genre: formGenre.trim() || undefined,
          description: formDesc.trim() || undefined,
          totalWordGoal: formGoal === '' ? undefined : Number(formGoal),
        });
        setBooks(prev => prev.map(b => b.id === editingId ? { ...b, ...updated } : b));
        toast.success('已保存');
      } else {
        const created = await booksApi.createBook({
          title: formTitle.trim(),
          genre: formGenre.trim() || undefined,
          description: formDesc.trim() || undefined,
        });
        setBooks(prev => [...prev, { ...created, totalWordGoal: formGoal === '' ? undefined : Number(formGoal) }]);
        toast.success('已创建');
      }
      setModalOpen(false);
    } catch { toast.error('保存失败'); }
    finally { setSaving(false); }
  };

  const togglePin = async (id: number) => {
    const book = books.find(b => b.id === id);
    if (!book) return;
    try {
      const updated = await booksApi.updateBook(id, { pinned: !book.pinned });
      setBooks(prev => prev.map(b => b.id === id ? { ...b, ...updated } : b));
    } catch { toast.error('操作失败'); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这本书吗？')) return;
    try {
      await booksApi.deleteBook(id);
      setBooks(prev => prev.filter(b => b.id !== id));
      setSelectedIds(prev => { const s = new Set(prev); s.delete(id); return s; });
      toast.success('已删除');
    } catch { toast.error('删除失败'); }
  };

  const handleBatchDelete = async () => {
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 本书吗？`)) return;
    for (const id of selectedIds) {
      try { await booksApi.deleteBook(id); } catch { /* continue */ }
    }
    setBooks(prev => prev.filter(b => !selectedIds.has(b.id)));
    setSelectedIds(new Set());
    toast.success('批量删除完成');
  };

  const sorted = useMemo(() => [...books].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)), [books]);
  const filtered = useMemo(() => sorted.filter(b => {
    const term = searchTerm.trim().toLowerCase();
    return !term || b.title.toLowerCase().includes(term) || (b.description ?? '').toLowerCase().includes(term);
  }), [sorted, searchTerm]);

  const formatWords = (n: number) => n >= 10000 ? `${(n / 10000).toFixed(1)} 万字` : `${n.toLocaleString()} 字`;

  return (
    <div className="h-full overflow-y-auto">
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border shadow-header">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <BookOpen size={20} strokeWidth={1.6} className="text-muted-foreground" />
              <div>
                <h1 className="text-lg font-semibold">书籍管理</h1>
                <p className="text-xs text-muted-foreground">{books.length} 本书 · {books.reduce((s, b) => s + (b.currentWordCount ?? 0), 0) >= 10000 ? formatWords(books.reduce((s, b) => s + (b.currentWordCount ?? 0), 0)) : '--'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {selectedIds.size > 0 && (
                <>
                  <button onClick={handleBatchDelete} className="flex items-center gap-1.5 h-8 px-3 rounded-md text-xs font-medium bg-destructive text-destructive-foreground hover:opacity-90 transition-opacity border-none cursor-pointer">
                    <Trash2 size={13} /> 删除 ({selectedIds.size})
                  </button>
                  <button onClick={() => setSelectedIds(new Set())} className="h-8 px-2.5 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-[var(--sidebar-hover)] transition-colors bg-transparent border-none cursor-pointer">
                    取消
                  </button>
                </>
              )}
              <button onClick={openNew} className="flex items-center gap-1.5 h-8 px-3.5 rounded-md bg-foreground text-background text-xs font-medium hover:opacity-90 transition-opacity border-none cursor-pointer">
                <Plus size={14} /> 新建
              </button>
            </div>
          </div>

          <div className="relative mt-4 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              placeholder="搜索书名或描述..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full h-8 pl-8 pr-3 rounded-md text-xs bg-background border border-border focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="px-6 py-5">
        {loading && <div className="flex items-center justify-center py-20 text-center text-sm text-muted-foreground">加载中...</div>}
        {!loading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <BookOpen size={36} strokeWidth={1.2} className="text-muted-foreground/25 mb-4" />
            <h3 className="text-sm font-medium text-muted-foreground">没有匹配的书籍</h3>
            <p className="text-xs text-muted-foreground/60 mt-1">试试别的关键词</p>
          </div>
        )}

        <div className="space-y-2">
          {filtered.map(book => {
            const progress = book.totalWordGoal ? Math.min(100, Math.round((book.currentWordCount ?? 0) / book.totalWordGoal * 100)) : 0;
            const isHovered = hoveredId === book.id;
            return (
              <div
                key={book.id}
                className="book-list-row flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-background/30 hover:border-border/60 hover:bg-background/50 hover:shadow-card"
                onMouseEnter={() => setHoveredId(book.id)}
                onMouseLeave={() => setHoveredId(null)}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(book.id)}
                  onChange={(e) => {
                    const s = new Set(selectedIds);
                    e.target.checked ? s.add(book.id) : s.delete(book.id);
                    setSelectedIds(s);
                  }}
                  className="w-3.5 h-3.5 rounded border-border accent-accent cursor-pointer shrink-0"
                />
                <button
                  type="button"
                  onClick={() => togglePin(book.id)}
                  className={cn('shrink-0 p-0.5 rounded transition-colors bg-transparent border-none cursor-pointer', book.pinned ? 'text-foreground' : 'text-muted-foreground/30 hover:text-muted-foreground')}
                >
                  {book.pinned ? <PinOff size={14} /> : <Pin size={14} />}
                </button>
                <Link href={`/books/${book.id}`} className="flex-1 min-w-0 flex items-center gap-4 no-underline text-inherit group">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm truncate group-hover:text-foreground/70 transition-colors">{book.title}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground shrink-0">{book.genre || '未分类'}</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">{book.description || '暂无简介'}</p>
                  </div>
                  <div className="shrink-0 flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{formatWords(book.currentWordCount ?? 0)}</span>
                    {book.totalWordGoal ? (
                      <div className="flex items-center gap-1.5">
                        <div className="w-16 h-1 bg-border/40 rounded-full overflow-hidden">
                          <div className="h-full bg-foreground rounded-full transition-all" style={{ width: `${progress}%` }} />
                        </div>
                        <span className="w-8 text-right tabular-nums">{progress}%</span>
                      </div>
                    ) : null}
                    <ChevronRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </Link>
                <button
                  onClick={() => openEdit(book)}
                  className={cn('h-7 w-7 grid place-items-center rounded text-muted-foreground hover:text-foreground hover:bg-[var(--sidebar-hover)] transition-colors bg-transparent border-none cursor-pointer shrink-0', isHovered ? 'opacity-100' : 'opacity-0')}
                >
                  <Pencil size={13} />
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(book.id); }}
                  className={cn('h-7 w-7 grid place-items-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors bg-transparent border-none cursor-pointer shrink-0', isHovered ? 'opacity-100' : 'opacity-0')}
                >
                  <Trash2 size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-foreground/[0.03]" onClick={() => setModalOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-border/50 bg-card shadow-2xl modal-enter">
            <div className="flex items-center px-5 h-12 border-b border-border/50">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{editingId !== null ? '编辑书籍' : '新建书籍'}</h2>
            </div>
            <div className="p-5 space-y-4">
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">书名</label>
                <input
                  value={formTitle}
                  onChange={(e) => setFormTitle(e.target.value)}
                  placeholder="请输入书名"
                  className="w-full h-8 px-3 rounded-md text-xs bg-background border border-border focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">类型</label>
                <input
                  value={formGenre}
                  onChange={(e) => setFormGenre(e.target.value)}
                  placeholder="如：科幻、奇幻、都市"
                  className="w-full h-8 px-3 rounded-md text-xs bg-background border border-border focus:outline-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">书籍简介</label>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  placeholder="请输入书籍简介"
                  rows={3}
                  className="w-full px-3 py-2 rounded-md text-xs bg-background border border-border focus:outline-none resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-medium text-muted-foreground">总字数目标</label>
                <input
                  type="number"
                  min={0}
                  value={formGoal}
                  onChange={(e) => setFormGoal(e.target.value ? Number(e.target.value) : '')}
                  placeholder="留空表示无目标"
                  className="w-full h-8 px-3 rounded-md text-xs bg-background border border-border focus:outline-none"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 h-14 border-t border-border/50">
              <button onClick={() => setModalOpen(false)} className="h-7 px-4 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-[var(--sidebar-hover)] transition-colors bg-transparent border-none cursor-pointer">
                取消
              </button>
              <button onClick={handleSave} disabled={saving || !formTitle.trim()} className="h-7 px-4 rounded-md text-xs font-medium bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
