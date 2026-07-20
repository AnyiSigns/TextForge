// src/components/projects/CharacterRelationsSheet.tsx
'use client';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Plus, Trash2 } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Character } from '@/types';

interface CharacterRelationsSheetProps {
  relTarget: Character | null;
  relDraft: { id: string; targetId: string; relation: string }[];
  projectChars: { id: string; name: string }[];
  onTargetChange: (id: string, patch: { targetId?: string; relation?: string }) => void;
  onRemoveRelation: (id: string) => void;
  onAddRelation: () => void;
  onApplyRelations: () => void;
  onSetRelTarget: (c: Character | null) => void;
}

export function CharacterRelationsSheet(props: CharacterRelationsSheetProps) {
  const {
    relTarget, relDraft, projectChars, onTargetChange, onRemoveRelation,
    onAddRelation, onApplyRelations, onSetRelTarget,
  } = props;

  return (
    <Sheet open={!!relTarget} onOpenChange={(o) => !o && onSetRelTarget(null)}>
      <SheetContent side="right" className="glass-sheet w-full sm:max-w-[22rem] overflow-y-auto rounded-l-3xl">
        {relTarget && (
          <>
            <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/30">
              <SheetTitle className="text-xl tracking-tight">角色关系 · {relTarget.name}</SheetTitle>
              <SheetDescription className="text-[13px]">自由添加与本项目其他角色的关系，如「宿敌」「师徒」「暗恋」。可自定义任意描述。</SheetDescription>
            </SheetHeader>
            <div className="mt-5 px-5 space-y-3">
              {relDraft.length === 0 && (
                <p className="text-xs text-muted-foreground">还没有设定关系，点击下方「添加关系」开始。</p>
              )}
              {relDraft.map((r) => (
                <div key={r.id} className="space-y-2 rounded-xl border border-border/40 p-3">
                  <div className="flex items-center gap-2">
                    <select
                      value={r.targetId}
                      onChange={(e) => onTargetChange(r.id, { targetId: e.target.value })}
                      className="flex-1 h-9 rounded-xl border border-border bg-background px-3 text-sm"
                    >
                      <option value="">选择角色…</option>
                      {projectChars.filter((c) => c.id !== relTarget.id).map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-destructive rounded-xl"
                      onClick={() => onRemoveRelation(r.id)}
                      aria-label="删除该关系"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                  <Input
                    value={r.relation}
                    onChange={(e) => onTargetChange(r.id, { relation: e.target.value })}
                    placeholder="关系描述，如：青梅竹马 / 宿敌 / 暗恋"
                    className="rounded-xl bg-background/40 border-border/30"
                  />
                </div>
              ))}
              <Button variant="outline" size="sm" className="rounded-xl" onClick={onAddRelation}>
                <Plus className="w-4 h-4 mr-1.5" /> 添加关系
              </Button>
              <Button className="rounded-xl px-6 w-full" onClick={onApplyRelations}>
                保存关系
              </Button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
