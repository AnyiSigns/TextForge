// src/features/manuscript/ui/SendToWorkbenchDialog.tsx
'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

interface SendToWorkbenchDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTitle: string;
  draftContent: string;
  chapterCount: number;
  onConfirm: (syncGlobal: boolean) => void;
}

export function SendToWorkbenchDialog({
  open, onOpenChange, activeTitle, draftContent, chapterCount, onConfirm,
}: SendToWorkbenchDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>发送到项目工作台</DialogTitle>
          <DialogDescription>
            会把当前章节追加到工作台的生成步骤中（不会覆盖已有步骤）。同步后，AI 续写时会把它当作前文。
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-lg border border-border/40 bg-muted/30 p-3 text-xs space-y-1">
          <p className="font-medium text-muted-foreground">同步预览（追加为 1 个步骤）</p>
          <p className="font-medium truncate">标题：{activeTitle || '未命名章节'}</p>
          <p className="text-muted-foreground line-clamp-4 leading-relaxed whitespace-pre-wrap">
            {draftContent.slice(0, 200) || '（当前章节为空）'}{draftContent.length > 200 ? '…' : ''}
          </p>
          <p className="text-muted-foreground/70">共 {draftContent.length} 字</p>
        </div>
        <div className="flex flex-col gap-2 mt-2">
          <Button size="sm" onClick={() => onConfirm(true)}>
            <ArrowRight className="w-4 h-4 mr-2" /> 同步到工作台（全局步骤）
          </Button>
          <Button size="sm" variant="outline" onClick={() => onConfirm(false)}>
            仅保留在手稿（本地，不同步）
          </Button>
        </div>
        <DialogClose render={<Button variant="ghost" size="sm" className="mt-1" />}>取消</DialogClose>
      </DialogContent>
    </Dialog>
  );
}
