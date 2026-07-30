'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ProjectCard } from '@/features/projects';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Search, FolderKanban, LayoutGrid, List, Loader2, Sparkles, Pin, PinOff, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import type { Book } from '@/types';
import { PageHeader } from '@/shared/components';
import { Spinner, EmptyState } from '@/shared/components';
import { useBookStore } from '@/features/projects';
import { generateSeed } from '@/lib/seed/generate';
import { ProjectRow } from './ProjectRow';

type ViewMode = 'grid' | 'list';

function useProjectsPage() {
  const books = useBookStore((s) => s.books);
  const load = useBookStore((s) => s.load);
  const removeProject = useBookStore((s) => s.removeBook);
  const togglePin = useBookStore((s) => s.togglePin);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [seedPrompt, setSeedPrompt] = useState('');
  const [isSeeding, setIsSeeding] = useState(false);
  useEffect(() => { load().catch((e) => toast.error('加载遇到了问题', { description: e instanceof Error ? e.message : '未知错误' })).finally(() => setIsLoading(false)); }, [load]);
  const handleDelete = async (id: number) => { if (!confirm('确定要删除这本书吗？')) return; try { await removeProject(id); toast.success('已删除'); } catch (e) { toast.error('删除出错了', { description: e instanceof Error ? e.message : '未知错误' }); } };
  const handleBatchDelete = async () => { const count = selectedIds.size; if (!count || !confirm(`确定要删除选中的 ${count} 本书吗？`)) return; try { await Promise.all(Array.from(selectedIds).map(id => removeProject(id))); setSelectedIds(new Set()); toast.success(`已删除 ${count} 本书`); } catch (e) { toast.error('删除出错了', { description: e instanceof Error ? e.message : '未知错误' }); } };
  const handleSeedFromEmpty = async () => { if (!seedPrompt.trim() || isSeeding) return; setIsSeeding(true); const prompt = seedPrompt.trim(); try { const book = await useBookStore.getState().addBook({ title: prompt.slice(0, 30), description: prompt, genre: '' }); await generateSeed(book.id, prompt); toast.success('已创建书籍并生成设定，去书籍里继续完善'); setSeedPrompt(''); } catch (e) { toast.error('开局出错了', { description: e instanceof Error ? e.message : '未知错误' }); } finally { setIsSeeding(false); } };
  const sorted = useMemo(() => [...books].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned)), [books]);
  const filtered = useMemo(() => sorted.filter(p => { const term = searchTerm.trim().toLowerCase(); return !term || p.title.toLowerCase().includes(term) || (p.description ?? '').toLowerCase().includes(term); }), [sorted, searchTerm]);
  return { books, isLoading, selectedIds, setSelectedIds, searchTerm, setSearchTerm, viewMode, setViewMode, seedPrompt, setSeedPrompt, isSeeding, handleDelete, handleBatchDelete, handleSeedFromEmpty, filtered, togglePin };
}

export default function ProjectsPage() {
  const { books, isLoading, selectedIds, setSelectedIds, searchTerm, setSearchTerm, viewMode, setViewMode, seedPrompt, setSeedPrompt, isSeeding, handleDelete, handleBatchDelete, handleSeedFromEmpty, filtered, togglePin } = useProjectsPage();
  if (isLoading) return <Spinner label="正在加载项目..." />;
  return (
    <div className="page-shell">
      <PageHeader icon={FolderKanban} title="项目管理" description="点击卡片上的置顶按钮可将项目固定在列表最前" actions={
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <>
              <Button variant="destructive" size="sm" onClick={handleBatchDelete}><Trash2 className="w-4 h-4 mr-2" /> 删除选中 ({selectedIds.size})</Button>
              <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>取消选择</Button>
            </>
          )}
          <div className="flex rounded-md border border-border/40 overflow-hidden">
            <Button variant={viewMode === 'grid' ? 'default' : 'ghost'} size="sm" className="h-8 w-8 p-0" onClick={() => setViewMode('grid')}><LayoutGrid className="w-4 h-4" /></Button>
            <Button variant={viewMode === 'list' ? 'default' : 'ghost'} size="sm" className="h-8 w-8 p-0" onClick={() => setViewMode('list')}><List className="w-4 h-4" /></Button>
          </div>
          <Button asChild><Link href="/projects/new"><Plus className="w-4 h-4 mr-2" /> 新建项目</Link></Button>
        </div>
      } />
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input placeholder="搜索项目名..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9" />
      </div>
      {books.length === 0 ? (
        <div className="my-4 space-y-4">
          <div className="glass-card border-primary/40 rounded-xl"><div className="p-5 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium"><Sparkles className="w-4 h-4 text-primary" /> 一句话开局</div>
            <p className="text-xs text-muted-foreground">输入一句话（如「一艘拾荒船打捞星海记忆的科幻故事」），自动创建书籍并生成世界观、角色与大纲。</p>
            <div className="flex gap-2">
              <Input value={seedPrompt} onChange={(e) => setSeedPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSeedFromEmpty(); }} placeholder="用一句话描述你想写的小说…" className="flex-1" />
              <Button size="sm" onClick={handleSeedFromEmpty} disabled={isSeeding || !seedPrompt.trim()}>{isSeeding ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}{isSeeding ? '生成中…' : '开局'}</Button>
            </div>
          </div></div>
          <EmptyState icon={FolderKanban} title="或手动开始" description="从空白项目起步，自己一步步搭建设定、角色与大纲。" action={<Button asChild size="sm"><Link href="/projects/new"><Plus className="w-4 h-4 mr-2" /> 新建项目</Link></Button>} />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FolderKanban} title="没有匹配的书籍" description="试试别的关键词" />
      ) : viewMode === 'list' ? (
        <div className="max-h-[600px] overflow-y-auto scrollbar-thin"><div className="space-y-2 stagger">
          {filtered.map(book => (
            <ProjectRow key={book.id} book={book} selected={selectedIds.has(book.id)} onToggleSelect={(checked) => { const s = new Set(selectedIds); if (checked) s.add(book.id); else s.delete(book.id); setSelectedIds(s); }} onDelete={handleDelete} onTogglePin={() => togglePin(book.id)} />
          ))}
        </div></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger">
          {filtered.map(book => (
            <div key={book.id} className="relative">
              <div className="absolute top-3 left-3 z-10"><Checkbox checked={selectedIds.has(book.id)} onCheckedChange={(checked) => { const s = new Set(selectedIds); if (checked) s.add(book.id); else s.delete(book.id); setSelectedIds(s); }} /></div>
              <button type="button" onClick={() => togglePin(book.id)} aria-label={book.pinned ? '取消置顶' : '置顶'} className="absolute top-3 right-3 z-10 text-muted-foreground/40 hover:text-primary transition-colors">{book.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}</button>
              <ProjectCard book={book} onDelete={handleDelete} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}