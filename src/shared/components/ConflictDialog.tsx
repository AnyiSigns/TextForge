// src/components/shared/ConflictDialog.tsx
'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { AlertTriangle } from 'lucide-react';
import { onSyncConflict, type SyncConflict } from '@/lib/storage/syncManager';

const STORE_LABELS: Record<string, string> = {
  projects: '项目',
  characters: '角色',
  briefs: '创作设定',
  models: '模型',
  settings: '设置',
  portfolio: '作品集',
};

function summarize(value: unknown): string {
  if (value && typeof value === 'object') {
    if (Array.isArray(value)) return `（${value.length} 项）`;
    const keys = Object.keys(value as Record<string, unknown>);
    const title = (value as Record<string, unknown>).title || (value as Record<string, unknown>).name;
    if (title) return String(title);
    return keys.length ? `字段：${keys.slice(0, 4).join('、')}${keys.length > 4 ? '…' : ''}` : '（空）';
  }
  return String(value ?? '');
}

export function ConflictDialog() {
  const [conflict, setConflict] = useState<SyncConflict | null>(null);

  useEffect(() => {
    return onSyncConflict((c) => setConflict(c));
  }, []);

  if (!conflict) return null;

  const label = STORE_LABELS[conflict.store] || conflict.store;

  const choose = (choice: 'local' | 'remote') => {
    conflict.resolve(choice);
    setConflict(null);
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) choose('local'); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" /> 数据冲突 · {label}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <p className="text-muted-foreground">
            云端与本地版本不一致，请选择采用哪一侧（仅影响本次同步）：
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-border/50 p-3 space-y-1">
              <p className="font-medium">本地（本机）</p>
              <p className="text-xs text-muted-foreground truncate">{summarize(conflict.local)}</p>
            </div>
            <div className="rounded-xl border border-border/50 p-3 space-y-1">
              <p className="font-medium">云端</p>
              <p className="text-xs text-muted-foreground truncate">{summarize(conflict.remote)}</p>
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => choose('local')}>保留本地</Button>
          <Button onClick={() => choose('remote')}>采用云端</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
