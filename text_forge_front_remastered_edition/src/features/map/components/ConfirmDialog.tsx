'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = '删除',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [disabled, setDisabled] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [onCancel]);

  const handleConfirm = () => {
    setDisabled(true);
    onConfirm();
  };

  return createPortal(
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[60] flex items-center justify-center"
      onClick={(e) => {
        if (e.target === overlayRef.current) onCancel();
      }}
      style={{
        animation: 'confirm-fade-in 0.15s ease-out',
        backgroundColor: 'rgba(28,27,26,0.08)',
      }}
    >
      <div
        className="rounded-xl border border-border/60 bg-card px-6 py-5 shadow-lg w-[320px]"
        style={{ animation: 'confirm-zoom-in 0.15s ease-out' }}
      >
        <h3 className="text-sm font-semibold text-foreground/80 mb-1">{title}</h3>
        <p className="text-[12px] text-muted-foreground/70 leading-relaxed mb-5">{message}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="h-8 px-4 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-foreground/5 bg-transparent border-none cursor-pointer transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleConfirm}
            disabled={disabled}
            className="h-8 px-4 rounded-md text-xs font-medium bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer disabled:opacity-50"
          >
            {disabled ? '处理中...' : confirmLabel}
          </button>
        </div>
      </div>

      <style jsx global>{`
        @keyframes confirm-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes confirm-zoom-in {
          from { transform: scale(0.95); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>,
    document.body,
  );
}
