'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Eye, Trash2, Download, FileText, Loader2, CheckCircle2, PauseCircle, FileJson, FileType } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Project } from '@/types';
import { useCharacterStore } from '@/lib/stores/characterStore';
import { useBriefStore } from '@/features/projects';
import { usePortfolioStore } from '@/lib/stores/portfolioStore';
import { useProjectStore } from '@/features/projects';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { exportProjectJson, exportProjectMarkdown, exportProjectText } from '@/lib/storage/backup';

const STATUS_MAP: Record<Project['status'], { label: string; icon: LucideIcon; variant: 'outline' | 'secondary' | 'default' }> = {
  draft:      { label: '草稿', icon: FileText, variant: 'outline' },
  generating: { label: '生成中', icon: Loader2, variant: 'secondary' },
  completed:  { label: '已完成', icon: CheckCircle2, variant: 'default' },
  paused:     { label: '已暂停', icon: PauseCircle, variant: 'outline' },
};

interface Props {
  project: Project;
  onDelete: (id: string) => void;
}

export function ProjectCard({ project, onDelete }: Props) {
  const characters = useCharacterStore(useShallow((s) => s.characters.filter((c) => c.projectId === project.id)));
  const brief = useBriefStore((s) => s.briefs[project.id]);
  const portfolio = usePortfolioStore(useShallow((s) => s.portfolio.filter((t) => t.project_id === project.id)));
  const projects = useProjectStore((s) => s.projects);
  const totalWordGoal = brief?.wordCountGoal ?? 0;
  const currentWords = projects.find((p) => p.id === project.id)?.description?.length ?? project.description?.length ?? 0;
  const progress = totalWordGoal > 0 ? Math.min(100, (currentWords / totalWordGoal) * 100) : 0;

  return (
    <Card className="card-elegant">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg">{project.title}</CardTitle>
          {(() => {
            const s = STATUS_MAP[project.status];
            const StatusIcon = s.icon;
            return (
              <Badge variant={s.variant} className="text-xs gap-1 shrink-0">
                <StatusIcon className="w-3 h-3" /> {s.label}
              </Badge>
            );
          })()}
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-xs text-muted-foreground space-y-1 mb-2">
          <p>创建: {new Date(project.createdAt).toLocaleDateString()}</p>
          <p>更新: {new Date(project.updatedAt).toLocaleDateString()}</p>
          <p>角色: {characters.length} | 素材: {portfolio.length}</p>
        </div>
        {totalWordGoal > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">进度</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="h-1.5 bg-border/30 rounded-full overflow-hidden">
              <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 mt-4">
          <Button asChild size="sm" className="flex-1">
            <Link href={`/projects/${project.id}`}>
              <Eye className="w-4 h-4 mr-2" /> 打开
            </Link>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="text-muted-foreground hover:text-foreground"
                aria-label="导出项目"
              >
                <Download className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onSelect={() => exportProjectJson(project.id).then(() => toast.success('已导出 JSON'))}>
                <FileJson className="w-4 h-4 mr-2" /> JSON
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportProjectMarkdown(project.id).then(() => toast.success('已导出 Markdown'))}>
                <FileType className="w-4 h-4 mr-2" /> Markdown
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportProjectText(project.id).then(() => toast.success('已导出 TXT'))}>
                <FileText className="w-4 h-4 mr-2" /> 纯文本
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(project.id)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}