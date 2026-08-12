'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Workflow as WorkflowIcon, GitBranch, Plus, Search, Trash2, Pencil, Play, Boxes, LayoutGrid, List } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/shared/ui/card';
import { cn } from '@/shared/lib/cn';
import * as workflowApi from '@/shared/api/workflows';
import type { Workflow } from '@/shared/api/workflows';
import { PageContainer } from '@/shared/ui/PageContainer';
import { PageHeader } from '@/shared/ui/PageHeader';
import { ListRow } from '@/shared/ui/ListRow';

export default function WorkflowListPage() {
  const router = useRouter();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('list');

  useEffect(() => {
    workflowApi.listWorkflows().then(setWorkflows).catch(() => {});
  }, []);

  const handleDelete = async (wf: Workflow) => {
    if (!confirm(`删除"${wf.name}"？`)) return;
    try {
      await workflowApi.deleteWorkflow(wf.id);
      setWorkflows((prev) => prev.filter((w) => w.id !== wf.id));
      toast.success('已删除');
    } catch { toast.error('删除失败'); }
  };

  const builtin = workflows.filter((w) => w.builtin);
  const custom = workflows.filter((w) => !w.builtin);
  const filtered = custom.filter((w) => !search || w.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <PageContainer>
      <PageHeader
        icon={WorkflowIcon}
        title="创作流程"
        description="管理角色节点和工作流，控制 Agent 生成内容的流程"
        actions={
          <>
            <div className="flex rounded-md border border-border overflow-hidden">
              {([['grid', LayoutGrid], ['list', List]] as const).map(([v, Icon]) => (
                <button key={v} onClick={() => setView(v)}
                  className={cn('px-2.5 py-1 text-xs bg-transparent border-none cursor-pointer', view === v ? 'bg-muted font-medium' : 'hover:bg-muted')}>
                  <Icon size={13} strokeWidth={1.8} />
                </button>
              ))}
            </div>
            <Link href="/workflow/new"
              className="flex items-center gap-1.5 h-8 px-3 rounded-md bg-foreground text-background text-xs font-medium no-underline hover:opacity-90">
              <Plus size={14} /> 新建
            </Link>
          </>
        }
      />

      <div className="px-6 py-5 space-y-6">
        {builtin.length > 0 && (
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-3">内置模板</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
              {builtin.map((wf) => (
                <Link key={wf.id} href={`/workflow/${wf.id}`} className="no-underline text-foreground">
                  <Card className="p-4 cursor-pointer hover:border-foreground/15 hover:shadow-card transition-all group h-full">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-md bg-gradient-to-br from-foreground/10 to-transparent grid place-items-center shrink-0">
                          <GitBranch size={14} className="text-muted-foreground" />
                        </div>
                        <span className="text-sm font-medium truncate">{wf.name}</span>
                      </div>
                      <span className="text-[10px] text-amber-600 border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 rounded-full shrink-0">内置</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">{wf.description || '无描述'}</p>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-2.5">
                      <Boxes size={10} />
                      <span>{wf.nodes?.length ?? 0} 个节点</span>
                    </div>
                  </Card>
                </Link>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">我的工作流</div>
            <div className="relative w-44">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="搜索..." className="w-full h-7 pl-7 pr-2 rounded-md text-[11px] bg-background border border-border focus:outline-none" />
            </div>
          </div>

          <div className={view === 'grid'
            ? 'grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3'
            : 'space-y-1'
          }>
            {filtered.map((wf) => (
              view === 'grid' ? (
                <div key={wf.id} onClick={() => router.push(`/workflow/${wf.id}`)} className="no-underline text-foreground cursor-pointer">
                  <Card className="p-4 cursor-pointer hover:border-foreground/15 hover:shadow-card transition-all group h-full">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-md bg-gradient-to-br from-foreground/10 to-transparent grid place-items-center shrink-0">
                          <GitBranch size={14} className="text-muted-foreground" />
                        </div>
                        <span className="text-sm font-medium truncate">{wf.name}</span>
                      </div>
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        <Link href={`/workflow/${wf.id}`} onClick={(e) => e.stopPropagation()} className="p-1 rounded hover:bg-muted text-muted-foreground"><Pencil size={12} /></Link>
                        <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(wf); }}
                          className="p-1 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive bg-transparent border-none cursor-pointer">
                          <Trash2 size={12} /></button>
                      </div>
                    </div>
                    <p className="text-[11px] text-muted-foreground line-clamp-2">{wf.description || '无描述'}</p>
                    <div className="flex items-center gap-1 text-[10px] text-muted-foreground mt-2.5">
                      <Boxes size={10} />
                      <span>{wf.nodes?.length ?? 0} 个节点</span>
                    </div>
                  </Card>
                </div>
              ) : (
                <div key={wf.id} onClick={() => router.push(`/workflow/${wf.id}`)}
                  className="no-underline text-foreground group cursor-pointer">
                  <ListRow className="justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-6 h-6 rounded-md bg-gradient-to-br from-foreground/10 to-transparent grid place-items-center shrink-0">
                        <GitBranch size={12} className="text-muted-foreground" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">{wf.name}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{wf.description || ''}</p>
                      </div>
                      <span className="text-[10px] text-muted-foreground shrink-0">{wf.nodes?.length ?? 0}节点</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.preventDefault(); e.stopPropagation(); handleDelete(wf); }}
                        className="p-1.5 rounded hover:bg-destructive/10 text-muted-foreground hover:text-destructive bg-transparent border-none cursor-pointer">
                        <Trash2 size={14} /></button>
                      <Link href={`/workflow/${wf.id}`} onClick={(e) => e.stopPropagation()} className="p-1.5 rounded hover:bg-muted text-muted-foreground"><Play size={14} /></Link>
                    </div>
                  </ListRow>
                </div>
              )
            ))}
            {filtered.length === 0 && (
              <div className="text-xs text-muted-foreground text-center py-8 col-span-full">
                {search ? '无匹配工作流' : '暂无自定义工作流，点击"新建"开始'}
              </div>
            )}
          </div>
        </div>
      </div>
    </PageContainer>
  );
}
