// src/app/(dashboard)/characters/[id]/chat/CharacterChatHeader.tsx
'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ArrowLeft, BookText, Lightbulb, Trash2, Settings2, Download, Search, X } from 'lucide-react';

interface CharacterChatHeaderProps {
  name: string;
  avatar: string;
  desc: string;
  projectId: string | null;
  search: string;
  isLoading: boolean;
  showClearConfirm: boolean;
  matchCount: number;
  onSearch: (v: string) => void;
  onClearSearch: () => void;
  onConvertToChapter: () => void;
  onSaveAsInspiration: () => void;
  onClearConversation: () => void;
  onOpenSettings: () => void;
  onExport: () => void;
}

export function CharacterChatHeader(props: CharacterChatHeaderProps) {
  const { name, avatar, desc, projectId, search, showClearConfirm, matchCount,
    onSearch, onClearSearch, onConvertToChapter, onSaveAsInspiration, onClearConversation,
    onOpenSettings, onExport } = props;
  const router = useRouter();

  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-4 pb-4 border-b border-border/40">
      <Button variant="ghost" size="sm" onClick={() => router.push('/characters')} className="shrink-0">
        <ArrowLeft className="w-4 h-4 mr-1 sm:mr-2" /> <span className="hidden sm:inline">返回</span>
      </Button>
      <Avatar className="w-9 h-9 sm:w-10 sm:h-10 shrink-0">
        <AvatarImage src={avatar} />
        <AvatarFallback>{name.slice(0, 2)}</AvatarFallback>
      </Avatar>
      <div className="min-w-0 flex-1">
        <h2 className="font-semibold truncate">{name}</h2>
        <p className="text-xs text-muted-foreground truncate max-w-full sm:max-w-xs">{desc}</p>
      </div>
      <div className="flex items-center gap-1 sm:gap-2 shrink-0 flex-wrap justify-end">
        {projectId && (
          <>
            <Button variant="ghost" size="sm" onClick={onConvertToChapter} className="text-muted-foreground hover:text-foreground">
              <BookText className="w-4 h-4 mr-2" /> <span className="hidden sm:inline">转为章节</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={onSaveAsInspiration} className="text-muted-foreground hover:text-foreground">
              <Lightbulb className="w-4 h-4 mr-2" /> <span className="hidden sm:inline">存为灵感</span>
            </Button>
          </>
        )}
        <Button variant="ghost" size="sm" onClick={onClearConversation} className={showClearConfirm ? "text-destructive hover:text-destructive" : "text-muted-foreground hover:text-destructive"}>
          <Trash2 className="w-4 h-4 mr-2" /> <span className="hidden sm:inline">{showClearConfirm ? '确认清空？' : '清空'}</span>
        </Button>
        <Button
          variant="ghost" size="sm"
          onClick={onOpenSettings}
          className="text-muted-foreground hover:text-foreground"
        >
          <Settings2 className="w-4 h-4 mr-2" /> <span className="hidden sm:inline">角色设定</span>
        </Button>
        <Button
          variant="ghost" size="sm"
          onClick={onExport}
          className="text-muted-foreground hover:text-foreground"
        >
          <Download className="w-4 h-4 mr-2" /> <span className="hidden sm:inline">导出记录</span>
        </Button>
      </div>

      <div className="flex items-center gap-2 mb-3 w-full">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => onSearch(e.target.value)}
            placeholder="搜索对话内容…"
            className="pl-9 pr-8"
          />
          {search && (
            <button
              onClick={onClearSearch}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="清除搜索"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        {search && (
          <span className="text-xs text-muted-foreground shrink-0">
            {matchCount} 条匹配
          </span>
        )}
      </div>
    </div>
  );
}
