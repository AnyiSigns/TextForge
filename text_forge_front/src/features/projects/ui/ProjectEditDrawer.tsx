'use client';

import { useState, useEffect } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { X } from 'lucide-react';
import { useBookStore } from '@/features/projects';
import type { Book } from '@/types';

interface ProjectEditDrawerProps {
  book: Book | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const GENRE_SUGGESTIONS = ['仙侠', '玄幻', '都市', '科幻', '历史', '悬疑', '游戏', '灵异'];

export function ProjectEditDrawer({ book, open, onOpenChange }: ProjectEditDrawerProps) {
  const updateBook = useBookStore((s) => s.updateBook);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [genres, setGenres] = useState<string[]>([]);
  const [genreInput, setGenreInput] = useState('');
  const [totalWordGoal, setTotalWordGoal] = useState<number | ''>('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!book) return;
    setTitle(book.title || '');
    setDescription(book.description || '');
    setGenres(book.genre ? book.genre.split(',').map((g) => g.trim()).filter(Boolean) : []);
    setTotalWordGoal(book.totalWordGoal ?? '');
    setGenreInput('');
  }, [book?.id, book?.title, book?.description, book?.genre, book?.totalWordGoal]);

  const handleAddGenre = () => {
    const value = genreInput.trim();
    if (!value) return;
    if (!genres.includes(value)) {
      setGenres([...genres, value]);
    }
    setGenreInput('');
  };

  const handleRemoveGenre = (genre: string) => {
    setGenres(genres.filter((g) => g !== genre));
  };

  const handleSave = async () => {
    if (!book) return;
    setSaving(true);
    try {
      await updateBook(book.id, {
        title: title.trim() || book.title,
        description: description.trim() || undefined,
        genre: genres.join(','),
        totalWordGoal: totalWordGoal === '' ? undefined : Number(totalWordGoal),
      });
      onOpenChange(false);
    } catch {
      // error handled by toast in store
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="glass-sheet w-full sm:max-w-[26rem] overflow-y-auto rounded-l-3xl">
        <SheetHeader className="px-6 pt-6 pb-4">
          <SheetTitle>编辑项目</SheetTitle>
          <SheetDescription>修改书名、类型与设定</SheetDescription>
        </SheetHeader>

        <div className="px-6 space-y-5 pb-6">
          <div className="space-y-1.5">
            <Label htmlFor="title">书名</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="请输入书名" />
          </div>

          <div className="space-y-1.5">
            <Label>项目类型</Label>
            <div className="flex flex-wrap gap-1.5">
              {genres.map((g) => (
                <Badge key={g} variant="secondary" className="rounded-full pl-2.5 pr-1 py-1 text-xs">
                  {g}
                  <button type="button" onClick={() => handleRemoveGenre(g)} className="ml-1 rounded-full hover:bg-black/10">
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={genreInput}
                onChange={(e) => setGenreInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddGenre();
                  }
                }}
                placeholder="输入类型后回车，如：仙侠"
              />
              <Button type="button" variant="outline" size="sm" onClick={handleAddGenre}>
                添加
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5 pt-1">
              {GENRE_SUGGESTIONS.filter((g) => !genres.includes(g)).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGenres([...genres, g])}
                  className="text-xs rounded-full border border-border/60 px-2.5 py-1 hover:border-primary hover:text-primary transition-colors"
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">故事梗概</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="请输入故事梗概"
              className="min-h-[120px]"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="totalWordGoal">总字数目标</Label>
            <Input
              id="totalWordGoal"
              type="number"
              min={0}
              value={totalWordGoal}
              onChange={(e) => setTotalWordGoal(e.target.value ? Number(e.target.value) : '')}
              placeholder="留空表示无目标"
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? '保存中...' : '保存'}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
