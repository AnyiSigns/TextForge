'use client';

/**
 * 剧情流：选择视角角色弹窗（从 StoryFlow.tsx renderCharacterPicker 抽离）。
 * 展示本章出场角色，支持选角进入或第三人称跳过。
 */
import type { Character } from '@/shared/api/types';

interface CharacterPickerProps {
  open: boolean;
  chapterTitle?: string;
  characters: Character[];
  onChoose: (charId: number) => void;
  onSkip: () => void;
}

export function CharacterPicker({ open, chapterTitle, characters, onChoose, onSkip }: CharacterPickerProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-6">
      <div className="modal-enter w-full max-w-lg bg-card border border-border/40 rounded-2xl shadow-card overflow-hidden flex flex-col max-h-[80vh]">
        <div className="px-6 py-4 border-b border-border/30 flex-shrink-0">
          <h3 className="text-[15px] font-semibold text-foreground/90">
            {chapterTitle ?? '本章'} · 选择视角角色
          </h3>
          <p className="text-[11px] text-muted-foreground/60 mt-1">
            以所选角色的所见所闻展开推演（第三人称叙述，展示层可切第一人称）
          </p>
        </div>
        <div className="flex-1 overflow-y-auto px-6 py-4 grid grid-cols-2 gap-3">
          {characters.map((c) => (
            <button
              key={c.id}
              onClick={() => onChoose(c.id)}
              className="text-left flex gap-2.5 items-start p-3 rounded-xl border border-border/40 bg-background/40 hover:border-foreground/20 hover:bg-foreground/[0.02] hover:shadow-sm transition-all cursor-pointer"
            >
              {c.avatarUrl ? (
                // 用户自定义远程头像 URL，next/image 需配置任意远程域名白名单，此处用 img 合理
                // eslint-disable-next-line @next/next/no-img-element
                <img src={c.avatarUrl} alt={c.name} className="w-9 h-9 rounded-full object-cover flex-shrink-0" />
              ) : (
                <span className="w-9 h-9 rounded-full bg-foreground/[0.06] flex items-center justify-center text-[13px] font-medium text-foreground/60 flex-shrink-0">
                  {c.name.slice(0, 1)}
                </span>
              )}
              <span className="min-w-0">
                <span className="flex items-center gap-1.5">
                  <span className="text-[13px] font-medium text-foreground/80">{c.name}</span>
                  {c.roleType && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-foreground/[0.05] text-foreground/50">{c.roleType}</span>
                  )}
                </span>
                {c.description && (
                  <span className="block text-[10px] text-muted-foreground/70 leading-relaxed mt-1 line-clamp-2">{c.description}</span>
                )}
              </span>
            </button>
          ))}
        </div>
        <div className="px-6 py-3 border-t border-border/30 flex-shrink-0 flex items-center justify-between">
          <button
            onClick={onSkip}
            className="text-[11px] text-muted-foreground/60 hover:text-foreground/70 bg-transparent border-none cursor-pointer"
          >
            以第三人称进入
          </button>
          <span className="text-[10px] text-muted-foreground/40">
            共 {characters.length} 位出场角色
          </span>
        </div>
      </div>
    </div>
  );
}
