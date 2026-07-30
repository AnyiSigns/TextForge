// src/features/manuscript/ui/ExportBookDialog.tsx
'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogClose } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { HelpCircle, FileText, BookOpen } from 'lucide-react';

interface ExportBookDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  askBookTxt: boolean;
  onAskBookTxtChange: (ask: boolean) => void;
  onExportTxt: (format: 'tidy' | 'format') => void;
  onExportMarkdown: (format: 'txt' | 'markdown') => void;
}

export function ExportBookDialog({
  open, onOpenChange, askBookTxt, onAskBookTxtChange, onExportTxt, onExportMarkdown,
}: ExportBookDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>导出书籍正文</DialogTitle>
          <DialogDescription>仅导出手稿章节正文（不含设定/角色/工作台步骤）。</DialogDescription>
        </DialogHeader>
        {askBookTxt ? (
          <div className="space-y-2 py-1">
            <Button variant="outline" className="w-full justify-start h-auto py-2.5 pr-2" onClick={() => onExportTxt('tidy')}>
              <div className="text-left flex-1">
                <p className="text-sm font-medium flex items-center gap-1">
                  仅轻度规整
                  <span className="inline-flex cursor-help" title="只做无害清理：去掉每行末尾多余空格、把连续多个空行压成一个。不改动你的段落和换行，正文原样保留。"><HelpCircle className="w-3.5 h-3.5 text-muted-foreground" /></span>
                </p>
                <p className="text-xs text-muted-foreground">去掉行尾空格、压缩多余空行，保留原段落与换行</p>
              </div>
            </Button>
            <Button variant="outline" className="w-full justify-start h-auto py-2.5 pr-2" onClick={() => onExportTxt('format')}>
              <div className="text-left flex-1">
                <p className="text-sm font-medium flex items-center gap-1">
                  轻度规整 + 段落排版
                  <span className="inline-flex cursor-help" title="在轻度规整基础上，按空行把正文重新分成整齐的段落；但《第X章》这类章节标题会单独成行、不会并入上一段。"><HelpCircle className="w-3.5 h-3.5 text-muted-foreground" /></span>
                </p>
                <p className="text-xs text-muted-foreground">在规整基础上重排段落，并保留章节标题不并入正文</p>
              </div>
            </Button>
            <Button variant="ghost" size="sm" className="mt-1" onClick={() => onAskBookTxtChange(false)}>返回</Button>
          </div>
        ) : (
          <div className="flex gap-2 mt-2">
            <Button size="sm" onClick={() => onExportMarkdown('txt')}><FileText className="w-4 h-4 mr-2" /> 纯文本 (TXT)</Button>
            <Button size="sm" variant="outline" onClick={() => onExportMarkdown('markdown')}><BookOpen className="w-4 h-4 mr-2" /> Markdown</Button>
          </div>
        )}
        <DialogClose render={<Button variant="ghost" size="sm" className="mt-1" />}>取消</DialogClose>
      </DialogContent>
    </Dialog>
  );
}

