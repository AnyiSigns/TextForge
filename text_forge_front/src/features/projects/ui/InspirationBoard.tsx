import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ChevronDown, BookOpen, FileText, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOutline } from '@/features/projects';
import { toast } from 'sonner';

export function InspirationBoard({ projectId }: { projectId: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const { volumes, loaded, reload, patchChapter } = useOutline({ bookId: Number(projectId) });
  const [savingIds, setSavingIds] = useState<Set<string>>(new Set());
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());

  const updateChapterSummary = (volId: string, chId: string, summary: string) => {
    patchChapter(volId, chId, { summary });
  };

  const handleSaveChapter = async (chId: string) => {
    setSavingIds((prev) => new Set(prev).add(chId));
    try {
      await reload();
      toast.success('已保存');
      setSavedIds((prev) => new Set(prev).add(chId));
      setTimeout(() => {
        setSavedIds((prev) => {
          const next = new Set(prev);
          next.delete(chId);
          return next;
        });
      }, 1500);
    } catch {
      toast.error('保存失败');
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(chId);
        return next;
      });
    }
  };

  return (
    <Card className="glass-card mt-6">
      <CardHeader className="cursor-pointer select-none" onClick={() => setIsExpanded(v => !v)}>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-primary" />
            章节摘要
          </span>
          <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
        </CardTitle>
      </CardHeader>
      {isExpanded && (
        <CardContent className="space-y-4">
          {!loaded ? (
            <p className="text-sm text-muted-foreground text-center py-6">加载中...</p>
          ) : !volumes.length ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              暂无大纲，请先在大纲页创建卷与章节。
            </p>
          ) : (
            <div className="space-y-4">
              {volumes.map((vol) => (
                <div key={vol.id} className="space-y-3">
                  <p className="text-xs font-medium text-foreground/70 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" /> {vol.title || '未命名卷'}
                  </p>
                  <div className="space-y-2">
                    {(Array.isArray(vol.chapters) ? vol.chapters : []).map((ch) => {
                      const isSaving = savingIds.has(ch.id);
                      const isSaved = savedIds.has(ch.id);
                      return (
                        <div key={ch.id} className="rounded-xl border border-border/40 bg-background/40 p-3">
                          <div className="flex items-center justify-between gap-2 mb-2">
                            <p className="font-medium text-foreground/80 text-xs">{ch.title || '未命名章节'}</p>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-7 px-2 text-xs"
                              disabled={isSaving}
                              onClick={() => handleSaveChapter(ch.id)}
                            >
                              <Save className="w-3.5 h-3.5 mr-1" />
                              {isSaving ? '保存中...' : isSaved ? '已保存' : '保存'}
                            </Button>
                          </div>
                          <Textarea
                            value={ch.summary ?? ''}
                            onChange={(e) => updateChapterSummary(vol.id, ch.id, e.target.value)}
                            placeholder="尚未生成摘要，可直接在此输入..."
                            rows={3}
                            className="text-xs"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
