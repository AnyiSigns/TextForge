'use client';

import { useMemo } from 'react';
import { useEntityStore } from '@/features/map/stores/entityStore';
import { cn } from '@/shared/lib/cn';

export function EntityPanel() {
  const foreshadowings = useEntityStore((s) => s.foreshadowings);
  const plotThreads = useEntityStore((s) => s.plotThreads);

  const statusColor = (status: string) => {
    switch (status) {
      case 'planted': return 'text-amber-500/60';
      case 'ongoing': return 'text-emerald-500/60';
      case 'resolved': return 'text-muted-foreground/40';
      default: return 'text-muted-foreground/50';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'planted': return '已埋下';
      case 'ongoing': return '进行中';
      case 'resolved': return '已回收';
      default: return status;
    }
  };

  return (
    <div className="space-y-5">
      {/* 伏笔 */}
      <div>
        <div className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider px-1 mb-2">
          伏笔
        </div>
        <div className="space-y-1.5">
          {foreshadowings.map((f) => (
            <div
              key={`f-${f.id}`}
              className="px-2 py-2 rounded-lg border border-border/30 bg-card/50"
            >
              <div className="flex items-start justify-between gap-2">
                <p className="text-[11px] leading-relaxed text-foreground/70 flex-1">
                  {f.description}
                </p>
                <span className={cn('text-[9px] flex-shrink-0', statusColor(f.status))}>
                  {statusLabel(f.status)}
                </span>
              </div>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[9px] text-muted-foreground/40">
                  揭示: {f.revealType === 'gradual' ? '逐步' : f.revealType === 'twist' ? '反转' : f.revealType}
                </span>
                {f.notes && (
                  <span className="text-[9px] text-muted-foreground/30 truncate">{f.notes}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 情节线 */}
      <div>
        <div className="text-[10px] font-medium text-muted-foreground/50 uppercase tracking-wider px-1 mb-2">
          情节线
        </div>
        <div className="space-y-1.5">
          {plotThreads.map((p) => (
            <div
              key={`p-${p.id}`}
              className="px-2 py-2 rounded-lg border border-border/30 bg-card/50"
            >
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-foreground/70">{p.name}</span>
                <span className={cn('text-[9px]', statusColor(p.status))}>
                  {statusLabel(p.status)}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-1 leading-relaxed">
                {p.description}
              </p>
              {p.progressNote && (
                <p className="text-[9px] text-muted-foreground/40 mt-1 italic">
                  {p.progressNote}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
