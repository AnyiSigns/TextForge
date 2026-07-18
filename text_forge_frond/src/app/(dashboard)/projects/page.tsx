'use client';

import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { ProjectCard } from '@/components/projects/ProjectCard';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Search, FolderKanban, Pin, PinOff, LayoutGrid, List, Trash2, FileText, Loader2, CheckCircle2, PauseCircle, Sparkles } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Project } from '@/types';
import { PageHeader } from '@/components/shared/PageHeader';
import { Spinner, EmptyState } from '@/components/shared/states';
import { useProjectStore } from '@/lib/stores/projectStore';
import { generateSeed } from '@/lib/seed/generate';

type ViewMode = 'grid' | 'list';
type FilterStatus = 'all' | Project['status'];

const STATUS_MAP: Record<Project['status'], { label: string; icon: LucideIcon; variant: 'outline' | 'secondary' | 'default' }> = {
  draft:      { label: '草稿', icon: FileText, variant: 'outline' },
  generating: { label: '生成中', icon: Loader2, variant: 'secondary' },
  completed:  { label: '已完成', icon: CheckCircle2, variant: 'default' },
  paused:     { label: '已暂停', icon: PauseCircle, variant: 'outline' },
};

export default function ProjectsPage() {
  const projects = useProjectStore((s) => s.projects);
  const load = useProjectStore((s) => s.load);
  const removeProject = useProjectStore((s) => s.removeProject);
  const togglePin = useProjectStore((s) => s.togglePin);
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all');
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  // 空态「一句话开局」：从一句话直接建项目并生成设定
  const [seedPrompt, setSeedPrompt] = useState('');
  const [isSeeding, setIsSeeding] = useState(false);

  useEffect(() => {
    load().catch(e => toast.error('加载失败', { description: e instanceof Error ? e.message : '未知错误' }))
      .finally(() => setIsLoading(false));
  }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个项目吗？')) return;
    try {
      await removeProject(id);
      toast.success('已删除');
    } catch (e) {
      toast.error('删除失败', { description: e instanceof Error ? e.message : '未知错误' });
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定要删除选中的 ${selectedIds.size} 个项目吗？`)) return;
    try {
      await Promise.all(Array.from(selectedIds).map(id => removeProject(id)));
      setSelectedIds(new Set());
      toast.success(`已删除 ${selectedIds.size} 个项目`);
    } catch (e) {
      toast.error('删除失败', { description: e instanceof Error ? e.message : '未知错误' });
    }
  };

  // 空态「一句话开局」：先本地建项目（拿到 id），再生成世界观/角色/大纲回填
  const handleSeedFromEmpty = async () => {
    if (!seedPrompt.trim() || isSeeding) return;
    setIsSeeding(true);
    const prompt = seedPrompt.trim();
    try {
      const project = await useProjectStore.getState().addProject({
        title: prompt.slice(0, 30),
        description: prompt,
        genre: '',
      });
      await generateSeed(project.id, prompt);
      toast.success('已创建项目并生成设定，去项目里继续完善');
      setSeedPrompt('');
    } catch (e) {
      toast.error('开局失败', { description: e instanceof Error ? e.message : '未知错误' });
    } finally {
      setIsSeeding(false);
    }
  };

  // 置顶项目排在最前，其余保持原有顺序
  const sorted = useMemo(() => {
    return [...projects].sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  }, [projects]);

  const filtered = sorted.filter(p => {
    const matchesSearch = p.title.includes(searchTerm);
    const matchesStatus = filterStatus === 'all' || p.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  if (isLoading) return <Spinner label="正在加载项目..." />;

  return (
    <div className="page-shell">
      <PageHeader
        icon={FolderKanban}
        title="项目管理"
        description="点击卡片上的置顶按钮可将项目固定在列表最前"
        actions={
          <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
              <>
                <Button variant="destructive" size="sm" onClick={handleBatchDelete}>
                  <Trash2 className="w-4 h-4 mr-2" /> 删除选中 ({selectedIds.size})
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                  取消选择
                </Button>
              </>
            )}
            <div className="flex rounded-md border border-border/40 overflow-hidden">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setViewMode('grid')}
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                className="h-8 w-8 p-0"
                onClick={() => setViewMode('list')}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
            <select
              value={filterStatus}
              onChange={e => setFilterStatus(e.target.value as FilterStatus)}
              className="h-8 text-xs bg-background/50 border border-border/40 rounded px-2"
            >
              <option value="all">全部状态</option>
              <option value="draft">草稿</option>
              <option value="generating">生成中</option>
              <option value="completed">已完成</option>
              <option value="paused">已暂停</option>
            </select>
            <Button asChild>
              <Link href="/projects/new"><Plus className="w-4 h-4 mr-2" /> 新建项目</Link>
            </Button>
          </div>
        }
      />

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="搜索项目名..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9"
        />
      </div>

      {projects.length === 0 ? (
        <div className="my-4 space-y-4">
          <div className="glass-card border-primary/40 rounded-xl">
            <div className="p-5 space-y-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Sparkles className="w-4 h-4 text-primary" />
                一句话开局
              </div>
              <p className="text-xs text-muted-foreground">
                输入一句话（如「一艘拾荒船打捞星海记忆的科幻故事」），自动创建项目并生成世界观、角色与大纲。
              </p>
              <div className="flex gap-2">
                <Input
                  value={seedPrompt}
                  onChange={(e) => setSeedPrompt(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSeedFromEmpty(); }}
                  placeholder="用一句话描述你想写的小说…"
                  className="flex-1"
                />
                <Button size="sm" onClick={handleSeedFromEmpty} disabled={isSeeding || !seedPrompt.trim()}>
                  {isSeeding ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
                  {isSeeding ? '生成中…' : '开局'}
                </Button>
              </div>
            </div>
          </div>

          <EmptyState
            icon={FolderKanban}
            title="或手动开始"
            description="从空白项目起步，自己一步步搭建设定、角色与大纲。"
            action={
              <Button asChild size="sm">
                <Link href="/projects/new"><Plus className="w-4 h-4 mr-2" /> 新建项目</Link>
              </Button>
            }
          />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title="没有匹配的项目"
          description="试试别的关键词"
        />
      ) : viewMode === 'list' ? (
        <div className="max-h-[600px] overflow-y-auto scrollbar-thin">
          <div className="space-y-2 stagger">
            {filtered.map(project => (
              <ProjectRow
                key={project.id}
                project={project}
                selected={selectedIds.has(project.id)}
                onToggleSelect={(checked) => {
                  const newSet = new Set(selectedIds);
                  if (checked) newSet.add(project.id);
                  else newSet.delete(project.id);
                  setSelectedIds(newSet);
                }}
                onDelete={handleDelete}
                onTogglePin={() => togglePin(project.id)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 stagger">
          {filtered.map(project => (
            <div key={project.id} className="relative">
              <div className="absolute top-3 left-3 z-10">
                <Checkbox
                  checked={selectedIds.has(project.id)}
                  onCheckedChange={(checked) => {
                    const newSet = new Set(selectedIds);
                    if (checked) newSet.add(project.id);
                    else newSet.delete(project.id);
                    setSelectedIds(newSet);
                  }}
                />
              </div>
              <button
                type="button"
                onClick={() => togglePin(project.id)}
                aria-label={project.pinned ? '取消置顶' : '置顶'}
                className="absolute top-3 right-3 z-10 text-muted-foreground/40 hover:text-primary transition-colors"
              >
                {project.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
              </button>
              <ProjectCard project={project} onDelete={handleDelete} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectRow({
  project,
  selected,
  onToggleSelect,
  onDelete,
  onTogglePin,
}: {
  project: Project;
  selected: boolean;
  onToggleSelect: (checked: boolean) => void;
  onDelete: (id: string) => void;
  onTogglePin: () => void;
}) {
  const s = STATUS_MAP[project.status];
  const StatusIcon = s.icon;

  return (
    <div className="flex items-center gap-2 p-2 border border-border/40 rounded-lg bg-background/30">
      <Checkbox
        checked={selected}
        onCheckedChange={(checked) => onToggleSelect(Boolean(checked))}
      />
      <button
        type="button"
        onClick={onTogglePin}
        aria-label={project.pinned ? '取消置顶' : '置顶'}
        className="text-muted-foreground/40 hover:text-primary transition-colors"
      >
        {project.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{project.title}</p>
        <p className="text-xs text-muted-foreground">{project.description?.slice(0, 60) || ''}</p>
      </div>
      <Badge variant={s.variant} className="text-xs gap-1 shrink-0">
        <StatusIcon className="w-3 h-3" /> {s.label}
      </Badge>
      <Button asChild size="sm" variant="ghost" className="h-7 px-2">
        <Link href={`/projects/${project.id}`}>打开</Link>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(project.id)}
      >
        <Trash2 className="w-3 h-3" />
      </Button>
    </div>
  );
}
