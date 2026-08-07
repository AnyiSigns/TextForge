'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useBookStore } from '@/features/projects';
import type { Book } from '@/types';

const GENRE_PRESETS = [
  { label: '通用', value: 'general' },
  { label: '科幻', value: 'science-fiction' },
  { label: '奇幻', value: 'fantasy' },
];

interface ProjectEditDrawerProps {
  book: Book | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProjectEditDrawer({ book, open, onOpenChange }: ProjectEditDrawerProps) {
  const updateBook = useBookStore((s) => s.updateBook);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [genre, setGenre] = useState('');
  const [totalWordGoal, setTotalWordGoal] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (book) {
      setTitle(book.title);
      setDescription(book.description ?? '');
      setGenre(book.genre ?? '');
      setTotalWordGoal(book.totalWordGoal ? String(book.totalWordGoal) : '');
    }
  }, [book]);

  const currentGenres = genre.split(/[,，、]/).map((s) => s.trim()).filter(Boolean);

  const toggleGenre = (value: string) => {
    const next = currentGenres.includes(value)
      ? currentGenres.filter((v) => v !== value)
      : [...currentGenres, value];
    setGenre(next.join(','));
  };

  const handleSave = async () => {
    if (!book) return;
    setSaving(true);
    try {
      await updateBook(book.id, {
        title: title || undefined,
        description: description || undefined,
        genre: genre || undefined,
        totalWordGoal: totalWordGoal ? Number(totalWordGoal) : undefined,
      });
      onOpenChange(false);
    } catch {
      // error handled by store/toast
    } finally {
      setSaving(false);
    }
  };

  if (!book) return null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>编辑项目</SheetTitle>
        </SheetHeader>
        <div className="mt-6 space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">书名</label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="输入书名" />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">项目类型</label>
            <div className="flex flex-wrap gap-2">
              {GENRE_PRESETS.map((preset) => (
                <Badge
                  key={preset.value}
                  variant={currentGenres.includes(preset.value) ? 'default' : 'outline'}
                  className="cursor-pointer"
                  onClick={() => toggleGenre(preset.value)}
                >
                  {preset.label}
                </Badge>
              ))}
            </div>
            <Input
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="自定义类型，用逗号分隔"
              className="mt-2"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">故事梗概</label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="输入故事梗概..." rows={4} />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">总字数目标</label>
            <Input type="number" value={totalWordGoal} onChange={(e) => setTotalWordGoal(e.target.value)} placeholder="0" min={0} />
          </div>
        </div>
        <SheetFooter className="mt-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? '保存中...' : '保存'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
