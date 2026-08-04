'use client';

import { Plus, Minus, ArrowLeft, Layers } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

interface ZoomControlsProps {
  depth: number;
  maxDepth: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onGoBack: () => void;
  canGoBack: boolean;
  canZoomIn: boolean;
  canZoomOut: boolean;
  locationName?: string;
}

export function ZoomControls({
  depth,
  maxDepth,
  onZoomIn,
  onZoomOut,
  onGoBack,
  canGoBack,
  canZoomIn,
  canZoomOut,
  locationName,
}: ZoomControlsProps) {
  return (
    <div className="absolute bottom-4 left-4 flex items-center gap-1.5">
      <div className="flex flex-col bg-card/90 backdrop-blur-sm border border-border/50 rounded-xl overflow-hidden shadow-sm">
        <button
          onClick={onZoomIn}
          disabled={!canZoomIn}
          className={cn(
            'w-8 h-8 flex items-center justify-center transition-colors bg-transparent border-none',
            canZoomIn
              ? 'cursor-pointer text-foreground/70 hover:text-foreground hover:bg-foreground/5'
              : 'cursor-not-allowed text-muted-foreground/30',
          )}
          title="放大"
        >
          <Plus size={14} strokeWidth={1.5} />
        </button>
        <div className="h-px bg-border/40" />
        <button
          onClick={onZoomOut}
          disabled={!canZoomOut}
          className={cn(
            'w-8 h-8 flex items-center justify-center transition-colors bg-transparent border-none',
            canZoomOut
              ? 'cursor-pointer text-foreground/70 hover:text-foreground hover:bg-foreground/5'
              : 'cursor-not-allowed text-muted-foreground/30',
          )}
          title="缩小"
        >
          <Minus size={14} strokeWidth={1.5} />
        </button>
      </div>

      {canGoBack && (
        <button
          onClick={onGoBack}
          className="w-8 h-8 flex items-center justify-center bg-card/90 backdrop-blur-sm border border-border/50 rounded-xl shadow-sm cursor-pointer text-foreground/70 hover:text-foreground hover:bg-foreground/5 transition-colors"
          title="返回上级"
        >
          <ArrowLeft size={14} strokeWidth={1.5} />
        </button>
      )}

      <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-card/90 backdrop-blur-sm border border-border/50 rounded-xl shadow-sm">
        <Layers size={12} className="text-muted-foreground/60" strokeWidth={1.5} />
        <span className="text-[11px] tabular-nums text-muted-foreground/80">
          {depth}/{maxDepth}
        </span>
        {locationName && (
          <>
            <span className="text-muted-foreground/30 text-[10px]">|</span>
            <span className="text-[11px] text-muted-foreground/60 truncate max-w-[120px]">
              {locationName}
            </span>
          </>
        )}
      </div>
    </div>
  );
}
