'use client';

import { useState, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { motion, useMotionValue, useTransform } from 'framer-motion';

interface DiffSliderProps {
  original: string;
  proposed: string;
  onAccept: () => void;
  onReject: () => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
}

export function DiffSlider({ original, proposed, onAccept, onReject, open, onOpenChange, title = 'AI 改写预览' }: DiffSliderProps) {
  const x = useMotionValue(0);
  const [committed, setCommitted] = useState<'accept' | 'reject' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const resetState = useCallback(() => {
    setCommitted(null);
    x.set(0);
  }, [x]);

  const handleDragEnd = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const currentX = x.get();
    const width = rect.width;
    const ratio = (currentX / width) * 100;
    if (ratio > 50) {
      setCommitted('accept');
      setTimeout(() => {
        onAccept();
        onOpenChange(false);
        resetState();
      }, 300);
    } else {
      setCommitted('reject');
      setTimeout(() => {
        onReject();
        onOpenChange(false);
        resetState();
      }, 300);
    }
  }, [onAccept, onReject, onOpenChange, resetState, x]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      onReject();
      resetState();
    }
    onOpenChange(next);
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-full max-w-2xl mx-4 rounded-2xl border border-border/60 bg-background shadow-elegant overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-border/30">
          <p className="text-sm font-medium">{title}</p>
          <Button variant="ghost" size="sm" onClick={() => handleOpenChange(false)}>关闭</Button>
        </div>
        <div className="p-4">
          <div
            ref={containerRef}
            className="relative h-64 rounded-xl border border-border/40 bg-background/60 overflow-hidden select-none"
            style={{ touchAction: 'none' }}
          >
            <div className="absolute inset-0 p-4 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground/60">
              {original}
            </div>
            <motion.div
              className="absolute inset-y-0 left-0 right-0 p-4 overflow-y-auto text-sm leading-relaxed whitespace-pre-wrap border-r-2 border-primary"
              style={{ clipPath: useTransform(x, [0, 1], ['inset(0 100% 0 0)', 'inset(0 0 0 0)']) }}
            >
              {proposed}
            </motion.div>
            <motion.div
              className="absolute top-0 bottom-0 w-1 bg-primary cursor-ew-resize flex items-center justify-center"
              style={{ x, left: '50%', translateX: '-50%' }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              dragElastic={0.1}
              onDragEnd={handleDragEnd}
              onDrag={() => {}}
            >
              <div className="h-8 w-1 rounded-full bg-primary/80" />
            </motion.div>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] text-muted-foreground bg-background/80 px-2 py-0.5 rounded-full">
              拖动对比 · 右侧 {'>'}50% 接受新稿
            </div>
          </div>
          <div className="flex items-center justify-between mt-3">
            <p className="text-xs text-muted-foreground">
              {committed === 'accept' ? '已接受新稿' : committed === 'reject' ? '已保留旧稿' : '松手即生效'}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => handleOpenChange(false)}>取消</Button>
              <Button size="sm" variant="destructive" onClick={onReject}>保留旧稿</Button>
              <Button size="sm" onClick={onAccept}>接受新稿</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
