// src/components/projects/CharacterStatusSheet.tsx
'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Character } from '@/types';

const STATUS_PRESETS = ['存活', '重伤', '失踪', '囚禁', '死亡', '未知'];

interface CharacterStatusSheetProps {
  statusTarget: Character | null;
  statusDraft: string;
  onStatusDraft: (v: string) => void;
  onApplyStatus: () => void;
  onSetStatusTarget: (c: Character | null) => void;
}

export function CharacterStatusSheet(props: CharacterStatusSheetProps) {
  const { statusTarget, statusDraft, onStatusDraft, onApplyStatus, onSetStatusTarget } = props;

  return (
    <Sheet open={!!statusTarget} onOpenChange={(o) => !o && onSetStatusTarget(null)}>
      <SheetContent side="right" className="glass-sheet w-full sm:max-w-[20rem] rounded-l-3xl">
        {statusTarget && (
          <>
            <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/30">
              <SheetTitle className="text-xl tracking-tight">设置角色状态 · {statusTarget.name}</SheetTitle>
              <SheetDescription className="text-[13px]">状态变化会通知后续章节生成上下文，帮助把控全局。</SheetDescription>
            </SheetHeader>
            <div className="mt-5 px-5 space-y-4">
              <div className="flex flex-wrap gap-2">
                {STATUS_PRESETS.map((s) => (
                  <button
                    key={s}
                    onClick={() => onStatusDraft(s)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${statusDraft === s ? 'bg-primary text-primary-foreground border-primary shadow-sm' : 'border-border/60 bg-background/30 hover:border-primary/50'}`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">自定义状态</label>
                <Input
                  value={statusDraft}
                  onChange={(e) => onStatusDraft(e.target.value)}
                  placeholder="如 半疯魔 / 假死脱身"
                  className="rounded-xl bg-background/40 border-border/30 focus-visible:border-primary/40"
                />
              </div>
              <Button className="rounded-xl px-6" onClick={onApplyStatus}>
                确认状态
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
