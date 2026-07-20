// src/app/(dashboard)/characters/[id]/chat/CharacterSettingsSheet.tsx
'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import type { Character } from '@/types';

interface CharacterSettingsSheetProps {
  character: Character | null;
  name: string;
  avatar: string;
  desc: string;
  projectId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CharacterSettingsSheet(props: CharacterSettingsSheetProps) {
  const { character, name, avatar, desc, projectId, open, onOpenChange } = props;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="glass-sheet w-full sm:max-w-[20rem] rounded-l-3xl">
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border/30">
          <SheetTitle className="text-xl tracking-tight">角色设定</SheetTitle>
          <SheetDescription className="text-[13px]">
            该角色的完整设定，对话与生成都将严格遵循
          </SheetDescription>
        </SheetHeader>
        <div className="mt-5 px-5 space-y-5">
          <div className="glass-sheet-card p-5">
            <div className="flex items-center gap-3">
              <Avatar className="w-16 h-16 rounded-2xl shrink-0">
                <AvatarImage src={avatar} />
                <AvatarFallback className="text-xl rounded-2xl">{name.slice(0, 2)}</AvatarFallback>
              </Avatar>
              <div>
                <p className="font-semibold text-lg">{name || "未命名角色"}</p>
                <p className="text-xs text-muted-foreground">
                  {projectId ? "关联小说项目" : "独立角色"}
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">角色描述</p>
            <div className="glass-sheet-card p-5">
              <p className="text-sm leading-relaxed whitespace-pre-wrap">
                {desc || "暂无设定"}
              </p>
            </div>
          </div>

          {(character?.role || character?.status || character?.currentProfile) && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">角色档案</p>
              <div className="glass-sheet-card p-5 space-y-3">
                {character?.role && (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground shrink-0">故事定位</span>
                    <span className="text-right">{character.role}</span>
                  </div>
                )}
                {character?.status && (
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="text-muted-foreground shrink-0">当前状态</span>
                    <span className="text-right">{character.status}</span>
                  </div>
                )}
                {character?.currentProfile && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">当前时间点</span>
                    <p className="mt-1 leading-relaxed whitespace-pre-wrap text-foreground/90">{character.currentProfile}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {projectId && (
            <div className="space-y-2">
              <p className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.12em]">项目关联</p>
              <div className="glass-sheet-card p-5">
                <p className="text-sm text-muted-foreground">
                  该角色已绑定到小说项目，对话时自动注入项目世界观与剧情上下文
                </p>
              </div>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
