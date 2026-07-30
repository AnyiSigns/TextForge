// src/app/(dashboard)/projects/ProjectRow.tsx
'use client';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import Link from 'next/link';
import { Pin, PinOff, Trash2 } from 'lucide-react';
import type { Book } from '@/types';

interface ProjectRowProps {
  book: Book;
  selected: boolean;
  onToggleSelect: (checked: boolean) => void;
  onDelete: (id: number) => void;
  onTogglePin: () => void;
}

export function ProjectRow({ book, selected, onToggleSelect, onDelete, onTogglePin }: ProjectRowProps) {
  return (
    <div className="flex items-center gap-2 p-2 border border-border/40 rounded-lg bg-background/30">
      <Checkbox checked={selected} onCheckedChange={(checked) => onToggleSelect(Boolean(checked))} />
      <button type="button" onClick={onTogglePin} aria-label={book.pinned ? '取消置顶' : '置顶'} className="text-muted-foreground/40 hover:text-primary transition-colors">
        {book.pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
      </button>
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate">{book.title}</p>
        <p className="text-xs text-muted-foreground">{book.description?.slice(0, 60) || ''}</p>
      </div>
      <Button asChild size="sm" variant="ghost" className="h-7 px-2">
        <Link href={`/projects/${book.id}`}>打开</Link>
      </Button>
      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => onDelete(book.id)}>
        <Trash2 className="w-3 h-3" />
      </Button>
    </div>
  );
}