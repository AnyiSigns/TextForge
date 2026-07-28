'use client';

import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Eye, Trash2, Download, FileText, FileJson, FileType } from 'lucide-react';
import { Book } from '@/types';
import { useCharacterStore } from '@/features/characters';
import { usePortfolioStore } from '@/features/projects';
import { useManuscriptStore } from '@/features/manuscript';
import { useShallow } from 'zustand/react/shallow';
import { toast } from 'sonner';
import { exportBookJson, exportBookMarkdown, exportBookText } from '@/lib/storage/backupExport';

interface Props {
  book: Book;
  onDelete: (id: number) => void;
}

export function ProjectCard({ book, onDelete }: Props) {
  const characters = useCharacterStore(useShallow((s) => s.characters.filter((c) => c.bookId === book.id)));
  const portfolio = usePortfolioStore(useShallow((s) => s.portfolio.filter((t) => t.project_id === String(book.id))));
  const chapters = useManuscriptStore(useShallow((s) => s.chapters.filter((c) => c.bookId === String(book.id))));
  const totalWordGoal = book.totalWordGoal ?? 0;
  const currentWords = chapters.reduce((acc, c) => acc + (c.content?.length || 0), 0);
  const progress = totalWordGoal > 0 ? Math.min(100, (currentWords / totalWordGoal) * 100) : 0;

  return (
    <Card className="card-elegant">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <CardTitle className="text-lg">{book.title}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <div className="text-xs text-muted-foreground space-y-1 mb-2">
          <p>创建: {new Date(book.createdAt).toLocaleDateString()}</p>
          <p>更新: {new Date(book.updatedAt).toLocaleDateString()}</p>
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
            <Link href={`/projects/${book.id}`}>
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
              <DropdownMenuItem onSelect={() => exportBookJson(book.id).then(() => toast.success('已导出 JSON'))}>
                <FileJson className="w-4 h-4 mr-2" /> JSON
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportBookMarkdown(book.id).then(() => toast.success('已导出 Markdown'))}>
                <FileType className="w-4 h-4 mr-2" /> Markdown
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => exportBookText(book.id).then(() => toast.success('已导出 TXT'))}>
                <FileText className="w-4 h-4 mr-2" /> 纯文本
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button
            variant="ghost"
            size="sm"
            className="text-muted-foreground hover:text-destructive"
            onClick={() => onDelete(book.id)}
          >
            <Trash2 className="w-4 h-4" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}