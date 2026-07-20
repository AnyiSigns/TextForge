// src/components/layout/BackendBadge.tsx
'use client';

import { Wifi, WifiOff, Loader2, RefreshCw, Gauge } from 'lucide-react';
import { useBackendStatus, useRetryBackendCheck } from '@/lib/hooks/useBackendStatus';
import { useNetworkQuality } from '@/lib/hooks/useNetworkQuality';
import { cn } from '@/lib/utils';

function latencyLabel(ms: number | null): { text: string; color: string } {
  if (ms == null) return { text: '延迟未知', color: 'text-muted-foreground' };
  if (ms < 120) return { text: `${ms}ms`, color: 'text-emerald-500/90' };
  if (ms < 350) return { text: `${ms}ms`, color: 'text-amber-500/90' };
  return { text: `${ms}ms`, color: 'text-destructive' };
}

export function BackendBadge({ className }: { className?: string }) {
  const status = useBackendStatus();
  const retry = useRetryBackendCheck();
  const { quality } = useNetworkQuality(status === 'online');

  if (status === 'checking') {
    return (
      <span className={cn('inline-flex items-center gap-1.5 text-xs text-muted-foreground', className)}>
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> 检测服务中…
      </span>
    );
  }

      if (status === 'online') {
        const lat = latencyLabel(quality.latencyMs);
        return (
          <span className={cn('inline-flex items-center gap-1.5 text-xs', className)}>
            <Wifi className="w-3.5 h-3.5 text-emerald-500/90" />
            <span className="text-emerald-500/90">已连接云端</span>
            <span className={cn('inline-flex items-center gap-1', lat.color)} title="云端服务网络延迟">
              <Gauge className="w-3 h-3" />
              {quality.measuring ? <Loader2 className="w-3 h-3 animate-spin" /> : lat.text}
            </span>
          </span>
        );
      }

  return (
    <button
      type="button"
      onClick={retry}
      title="后端未连接，数据仅保存在本机。点击重试。"
      className={cn(
        'inline-flex items-center gap-1.5 text-xs text-amber-500/90 hover:text-amber-400 transition-colors',
        className,
      )}
    >
      <WifiOff className="w-3.5 h-3.5" />
      <span>本地模式</span>
      <RefreshCw className="w-3 h-3 opacity-60" />
    </button>
  );
}
