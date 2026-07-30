// src/features/manuscript/ui/ImportBookDialog.tsx
'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

interface ImportBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookName: string;
  chapterCount: number;
  onConfirm: (syncGlobal: boolean) => void;
}

export function ImportBookDialog({
  open, onOpenChange, bookName, chapterCount, onConfirm,
}: ImportBookDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>导入书籍：{bookName}</DialogTitle>
          <DialogDescription>
            已识别 {chapterCount} 个章节。选择导入位置：仅导入手稿（本地续写），或同步到工作台（AI 会把这章作为前文续写）。
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-48 overflow-y-auto rounded-lg border border-border/40 p-2 space-y-1 mt-2">
          {/* 章节列表由父组件传入渲染，或在此处简化展示 */}
        </div>
        <div className="flex flex-col gap-2 mt-2">
          <Button size="sm" onClick={() => onConfirm(true)}>
            <ArrowRight className="w-4 h-4 mr-2" /> 同步到工作台（{chapterCount} 章）
          </Button>
          <Button size="sm" variant="outline" onClick={() => onConfirm(false)}>
            仅导入到手稿（本地续写）
          </Button>
        </div>
        <DialogClose render={<Button variant="ghost" size="sm" className="mt-1" />}>取消</DialogClose>
      </DialogContent>
    </Dialog>
  );
}
