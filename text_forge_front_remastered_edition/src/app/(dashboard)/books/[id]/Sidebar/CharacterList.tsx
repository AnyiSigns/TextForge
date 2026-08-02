'use client';

import Link from 'next/link';
import { Plus, Lock } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { useBookDetailStore } from '../store';

export function CharacterList() {
  const characters = useBookDetailStore((s) => s.characters);

  return (
    <>
      <div className="ide-sidebar-header">
        角色
        <button className="text-muted-foreground text-xs hover:text-foreground cursor-pointer bg-transparent border-none" title="新建角色">
          <Plus size={14} />
        </button>
      </div>
      <div className="ide-sidebar-body p-1 space-y-0.5">
        {characters.map((ch) => {
          const customFields = (ch.customFields as Record<string, unknown>) || {};
          const customKeys = Object.keys(customFields);
          return (
            <Link key={ch.id} href={`/characters/${ch.id}`} className="no-underline text-foreground block">
              <div
                className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--sidebar-hover)] cursor-pointer text-[13px]"
                role="button"
                tabIndex={0}
              >
                <div className="w-6 h-6 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold shrink-0">
                  {ch.name.charAt(0)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{ch.name}</div>
                  <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                    {ch.roleType && <span>{ch.roleType}</span>}
                    {customKeys.length > 0 && <span className="text-muted-foreground/70">· {customKeys.length}属性</span>}
                    {ch.locked && <Lock size={9} className="text-muted-foreground/70" />}
                  </div>
                </div>
                <span className={cn(
                  'w-1.5 h-1.5 rounded-full shrink-0',
                  ch.status === 'active' ? 'bg-green-500' : 'bg-muted-foreground/40',
                )} />
              </div>
            </Link>
          );
        })}
        {characters.length === 0 && (
          <div className="text-xs text-muted-foreground p-3 text-center">暂无角色</div>
        )}
      </div>
      <div className="ide-sidebar-footer space-y-0.5">
        <div className="ide-sidebar-stat"><span>总角色数</span><span>{characters.length}</span></div>
        <div className="ide-sidebar-stat"><span>已锁定</span><span>{characters.filter((c) => c.locked).length}</span></div>
      </div>
    </>
  );
}
