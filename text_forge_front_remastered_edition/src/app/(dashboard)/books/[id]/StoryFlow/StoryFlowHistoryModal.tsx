'use client';

import { useEffect, useState } from 'react';
import { History, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { listStoryFlows, deleteStoryFlow, type StoryFlow } from '@/shared/api/storyFlow';
import { useEntityStore } from '@/features/map/stores/entityStore';
import { parseUtc } from '@/shared/lib/datetime';

interface StoryFlowHistoryModalProps {
  open: boolean;
  bookId: number;
  onClose: () => void;
  onOpenFlow: (flowId: number) => void;
}

function formatTime(iso?: string | null): string {
  if (!iso) return '';
  // 后端时间为 naive UTC：统一经 parseUtc 按 UTC 解析，避免本地时区偏移
  const d = parseUtc(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function StoryFlowHistoryModal({ open, bookId, onClose, onOpenFlow }: StoryFlowHistoryModalProps) {
  const [flows, setFlows] = useState<StoryFlow[]>([]);
  const [loading, setLoading] = useState(false);
  const chapters = useEntityStore((s) => s.chapters);

  // 渲染期重置（每次打开时清空旧列表进入加载态），异步请求放 effect 内
  const [prevOpen, setPrevOpen] = useState(false);
  if (open && !prevOpen) {
    setPrevOpen(true);
    setLoading(true);
    setFlows([]);
  }

  useEffect(() => {
    if (!open) return;
    let alive = true;
    listStoryFlows(bookId)
      .then((items) => {
        if (alive) setFlows(items);
      })
      .catch(() => {
        if (alive) toast.error('历史推演加载失败');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [open, bookId]);

  const handleClose = () => {
    setPrevOpen(false);
    onClose();
  };

  const reload = () => {
    setLoading(true);
    listStoryFlows(bookId)
      .then((items) => setFlows(items))
      .catch(() => toast.error('历史推演加载失败'))
      .finally(() => setLoading(false));
  };

  if (!open) return null;

  const handleDelete = async (flowId: number) => {
    try {
      await deleteStoryFlow(flowId);
      toast.success('已删除推演记录');
      reload();
    } catch {
      toast.error('删除失败，请重试');
    }
  };

  const chapterTitle = (chapterId: number | null) =>
    chapters.find((c) => c.id === chapterId)?.title ?? null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-background/70" onClick={handleClose}>
      <div
        className="w-[420px] max-w-[92vw] rounded-lg border border-border bg-background shadow-lg flex flex-col max-h-[70vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <History size={14} /> 历史推演
          </h3>
          <button
            onClick={handleClose}
            className="w-6 h-6 flex items-center justify-center rounded bg-transparent border-none cursor-pointer text-foreground/30 hover:text-foreground/60"
          >
            <X size={13} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading && flows.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/50 px-2 py-4 text-center">加载中…</p>
          ) : flows.length === 0 ? (
            <p className="text-[11px] text-muted-foreground/50 px-2 py-4 text-center">暂无推演记录</p>
          ) : (
            flows.map((flow) => {
              const title = chapterTitle(flow.chapterId);
              return (
                <div
                  key={flow.id}
                  className="flex items-center gap-2 px-3 py-2 rounded-md hover:bg-foreground/[0.03] group"
                >
                  <button
                    onClick={() => onOpenFlow(flow.id)}
                    className="flex-1 min-w-0 text-left bg-transparent border-none cursor-pointer"
                  >
                    <div className="text-[12px] text-foreground/80 truncate">
                      {title ?? `章节 #${flow.chapterId}`}
                    </div>
                    <div className="text-[10px] text-muted-foreground/50 flex items-center gap-2">
                      <span>{flow.roundCount} 轮</span>
                      <span
                        className={flow.status === 'completed' ? 'text-foreground/40' : 'text-amber-600/70'}
                      >
                        {flow.status === 'completed' ? '已完成' : '进行中'}
                      </span>
                      <span>{formatTime(flow.updatedAt)}</span>
                    </div>
                  </button>
                  <button
                    onClick={() => void handleDelete(flow.id)}
                    title="删除记录"
                    className="w-6 h-6 flex items-center justify-center rounded text-foreground/25 hover:text-red-500/80 hover:bg-red-500/[0.06] bg-transparent border-none cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
