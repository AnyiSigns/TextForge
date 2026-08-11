'use client';

/**
 * 剧情流：结束推演确认弹窗（从 StoryFlow.tsx renderEndConfirm 抽离）。
 */
interface EndConfirmModalProps {
  open: boolean;
  remainingEvents: number | null;
  onConfirm: () => void;
  onCancel: () => void;
}

export function EndConfirmModal({ open, remainingEvents, onConfirm, onCancel }: EndConfirmModalProps) {
  if (!open) return null;
  const text = remainingEvents !== null && remainingEvents > 0
    ? `尚有 ${remainingEvents} 个事件未推演，确认结束？`
    : remainingEvents === 0
      ? '推演已完整，确认结束？'
      : '确认结束本次推演？';
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
      <div className="modal-enter w-full max-w-sm bg-card border border-border/40 rounded-2xl shadow-card p-6">
        <h3 className="text-[15px] font-semibold text-foreground/90 mb-2">结束推演</h3>
        <p className="text-[12px] text-muted-foreground/70 mb-5">{text}</p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="h-8 px-4 rounded-md text-[12px] text-muted-foreground/70 border border-border/40 bg-transparent cursor-pointer hover:text-foreground/80"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="h-8 px-4 rounded-md text-[12px] font-medium bg-foreground text-background border-none cursor-pointer hover:opacity-90"
          >
            确认结束
          </button>
        </div>
      </div>
    </div>
  );
}
