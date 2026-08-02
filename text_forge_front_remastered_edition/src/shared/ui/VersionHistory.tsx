'use client';

import { useEffect, useState } from 'react';
import { X, GitCompare } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

interface VersionItem {
  version: number;
  content: string;
  createdAt: string;
}

interface VersionHistoryProps {
  versions: VersionItem[];
  currentVersion: number;
  onCompare: (fromVersion: number, toVersion: number) => void;
  onClose: () => void;
}

export function VersionHistory({ versions, currentVersion, onCompare, onClose }: VersionHistoryProps) {
  const [selectedVersions, setSelectedVersions] = useState<number[]>([]);

  useEffect(() => {
    setSelectedVersions([]);
  }, [versions.length]);

  const toggleSelect = (v: number) => {
    setSelectedVersions((prev) => {
      if (prev.includes(v)) return prev.filter((x) => x !== v);
      if (prev.length >= 2) return [prev[1], v];
      return [...prev, v];
    });
  };

  const sorted = [...versions].sort((a, b) => b.version - a.version);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-3 border-b border-border">
        <span className="text-xs font-semibold">版本历史</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer">
          <X size={14} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {sorted.map((v) => (
          <div
            key={v.version}
            onClick={() => toggleSelect(v.version)}
            className={cn(
              'p-2 rounded-md cursor-pointer text-[12px] transition-colors border',
              selectedVersions.includes(v.version) ? 'border-foreground/30 bg-foreground/5' : 'border-transparent hover:bg-[var(--sidebar-hover)]',
              v.version === currentVersion && 'border-l-2 border-l-foreground/40',
            )}
            role="button"
            tabIndex={0}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="font-semibold">v{v.version}</span>
              {v.version === currentVersion && (
                <span className="text-[10px] bg-muted px-1 rounded">当前</span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              {v.content?.slice(0, 60) || '空内容'}
            </div>
            <div className="text-[10px] text-muted-foreground/60 mt-0.5">
              {new Date(v.createdAt).toLocaleString()}
            </div>
          </div>
        ))}
        {sorted.length === 0 && (
          <div className="text-xs text-muted-foreground text-center py-8">暂无历史版本</div>
        )}
      </div>
      {selectedVersions.length === 2 && (
        <div className="p-3 border-t border-border">
          <button
            onClick={() => {
              const [a, b] = selectedVersions.sort((x, y) => x - y);
              onCompare(a, b);
            }}
            className="flex items-center justify-center gap-1 w-full h-8 rounded-md bg-foreground text-background text-xs font-medium border-none cursor-pointer hover:opacity-90"
          >
            <GitCompare size={12} /> 对比 v{Math.min(...selectedVersions)} ↔ v{Math.max(...selectedVersions)}
          </button>
        </div>
      )}
    </div>
  );
}
