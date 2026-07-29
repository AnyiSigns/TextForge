'use client';

import { useState, ReactNode } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface AntiMistakeBlockProps {
  blocked: boolean;
  message?: string;
  forceLabel?: string;
  cancelLabel?: string;
  onForce: () => void;
  onCancel: () => void;
  defaultLabel?: ReactNode;
  onDefault?: () => void;
}

export function AntiMistakeBlock({
  blocked,
  message = '当前有运行中的任务，删除可能导致数据丢失',
  forceLabel = '强制终止并删除',
  cancelLabel = '取消',
  onForce,
  onCancel,
  defaultLabel,
  onDefault,
}: AntiMistakeBlockProps) {
  const [showWarning, setShowWarning] = useState(false);

  const handleDefaultClick = () => {
    if (blocked) {
      setShowWarning(true);
    } else {
      onDefault?.();
    }
  };

  const handleForce = () => {
    setShowWarning(false);
    onForce();
  };

  const handleCancel = () => {
    setShowWarning(false);
    onCancel();
  };

  return (
    <div className="space-y-2">
      <Button
        variant="ghost"
        size="sm"
        className={cn(
          'text-muted-foreground hover:text-destructive transition-colors',
          blocked && 'opacity-50 cursor-not-allowed hover:text-muted-foreground'
        )}
        onClick={handleDefaultClick}
        disabled={blocked && !showWarning}
      >
        {defaultLabel ?? <Trash2 className="w-4 h-4" />}
      </Button>

      <AnimatePresence>
        {showWarning && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
                <p className="text-xs text-destructive/90 leading-relaxed">{message}</p>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleCancel}>
                  {cancelLabel}
                </Button>
                <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={handleForce}>
                  {forceLabel}
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
