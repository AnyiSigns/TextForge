'use client';

import { useMemo } from 'react';
import { X, Minus, Plus } from 'lucide-react';
import { cn } from '@/shared/lib/cn';

export interface DiffViewProps {
  fromContent: string;
  toContent: string;
  fromVersion: number;
  toVersion: number;
  onClose: () => void;
}

function computeDiff(oldText: string, newText: string): Array<{ type: 'same' | 'add' | 'remove'; text: string }> {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result: Array<{ type: 'same' | 'add' | 'remove'; text: string }> = [];

  const maxLen = Math.max(oldLines.length, newLines.length);
  for (let i = 0; i < maxLen; i++) {
    const oldLine = oldLines[i];
    const newLine = newLines[i];
    if (oldLine === undefined) {
      result.push({ type: 'add', text: newLine });
    } else if (newLine === undefined) {
      result.push({ type: 'remove', text: oldLine });
    } else if (oldLine === newLine) {
      result.push({ type: 'same', text: oldLine });
    } else {
      result.push({ type: 'remove', text: oldLine });
      result.push({ type: 'add', text: newLine });
    }
  }
  return result;
}

export function DiffView({ fromContent, toContent, fromVersion, toVersion, onClose }: DiffViewProps) {
  const diff = useMemo(() => computeDiff(fromContent, toContent), [fromContent, toContent]);

  return (
    <div className="fixed inset-0 z-50 bg-background/95 flex flex-col">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border shrink-0">
        <div className="flex items-center gap-4 text-xs">
          <span className="text-muted-foreground">版本对比</span>
          <span className="text-red-500 flex items-center gap-1"><Minus size={10} /> v{fromVersion}</span>
          <span className="text-green-600 flex items-center gap-1"><Plus size={10} /> v{toVersion}</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground bg-transparent border-none cursor-pointer">
          <X size={16} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 text-[14px] leading-relaxed font-[var(--font-mono),monospace] whitespace-pre-wrap">
        {diff.map((line, i) => (
          <div
            key={i}
            className={cn(
              'py-0.5',
              line.type === 'add' && 'bg-green-500/10 text-green-700',
              line.type === 'remove' && 'bg-red-500/10 text-red-700 line-through',
            )}
          >
            {line.type === 'add' ? '+ ' : line.type === 'remove' ? '- ' : '  '}
            {line.text}
          </div>
        ))}
      </div>
    </div>
  );
}
