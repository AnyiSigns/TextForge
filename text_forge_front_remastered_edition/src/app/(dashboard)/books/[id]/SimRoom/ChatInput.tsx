'use client';

/**
 * 角色模拟：输入区（从 SimRoom.tsx 内联抽离）。
 * 我的身份徽标 + AI 自动推进 + 生成支线（类型选择）+ 推荐卡片 + 自定义输入。
 */
import { useState } from 'react';
import { Loader2, Send, Sparkles } from 'lucide-react';
import type { SimSuggestion } from '@/shared/api/useSimRoom';
import { BRANCH_TYPES } from './constants';

interface ChatInputProps {
  myRole: string;
  streaming: boolean;
  suggestions: SimSuggestion[];
  branching: boolean;
  /** 是否有 AI/场景消息（生成支线按钮可用性） */
  canBranch: boolean;
  onSend: (content: string) => void;
  onAutoAdvance: (turns?: number) => void;
  onBranchType: (type: string) => void;
}

export function ChatInput({
  myRole,
  streaming,
  suggestions,
  branching,
  canBranch,
  onSend,
  onAutoAdvance,
  onBranchType,
}: ChatInputProps) {
  // 卡片式输入区：自定义内容卡片展开状态
  const [customOpen, setCustomOpen] = useState(false);
  const [customInput, setCustomInput] = useState('');
  // 沉淀支线：类型选择面板
  const [showBranchPicker, setShowBranchPicker] = useState(false);

  const handleSuggestionClick = (content: string) => {
    if (!content.trim() || streaming) return;
    onSend(content.trim());
  };

  const handleCustomSend = () => {
    if (!customInput.trim() || streaming) return;
    onSend(customInput.trim());
    setCustomInput('');
    setCustomOpen(false);
  };

  const handleBranchType = (type: string) => {
    onBranchType(type);
    setShowBranchPicker(false);
  };

  return (
    <div className="px-4 py-3 border-t border-border/30 flex-shrink-0 space-y-2">
      {/* 我的身份 + AI 推进 + 生成支线 */}
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] bg-muted/50 text-foreground/70 shrink-0">
          <Sparkles size={11} className="text-foreground/40" />
          <span className="font-medium">{myRole || '用户'}</span>
          <span className="text-foreground/40">发言</span>
        </span>
        <button
          onClick={() => onAutoAdvance(2)}
          disabled={streaming}
          className="h-7 px-2.5 rounded-md text-[11px] border border-foreground/25 bg-transparent cursor-pointer hover:bg-foreground/[0.05] text-foreground/75 shrink-0 disabled:opacity-40 flex items-center gap-1"
          title="让 AI 自动推进 2 轮剧情，快速积累支线素材"
        >
          {streaming ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
          {streaming ? 'AI 推进中…' : 'AI 推进剧情'}
        </button>
        <div className="flex-1" />
        {branching ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <Loader2 size={11} className="animate-spin" /> 支线生成中…
          </span>
        ) : (
          <>
            {showBranchPicker ? (
              <div className="flex items-center gap-1 flex-wrap justify-end">
                {BRANCH_TYPES.map((bt) => (
                  <button
                    key={bt.value}
                    onClick={() => handleBranchType(bt.value)}
                    className="h-6 px-2 rounded-md text-[10px] border border-border bg-transparent cursor-pointer hover:bg-foreground/[0.04] text-foreground/70"
                  >
                    {bt.label}
                  </button>
                ))}
                <button
                  onClick={() => setShowBranchPicker(false)}
                  className="h-6 px-2 rounded-md text-[10px] text-muted-foreground border border-transparent bg-transparent cursor-pointer hover:bg-foreground/[0.04]"
                >
                  取消
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowBranchPicker(true)}
                disabled={streaming || !canBranch}
                className="h-7 px-3 rounded-md text-[11px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer shrink-0 disabled:opacity-40"
                title="把当前对话沉淀为一条角色支线素材"
              >
                ＋ 生成支线
              </button>
            )}
          </>
        )}
      </div>

      {/* 卡片式输入区：2 张 AI 推荐卡片 + 自定义卡片 */}
      <div className="grid grid-cols-2 gap-1.5">
        {streaming ? (
          <div className="col-span-2 px-3 py-2 rounded-xl border border-dashed border-border/60 text-[11px] text-muted-foreground/60 flex items-center justify-center gap-1.5">
            <Loader2 size={11} className="animate-spin" />
            AI 推进中…
          </div>
        ) : (
          <>
            {suggestions.map((s) => (
              <button
                key={s.label}
                onClick={() => handleSuggestionClick(s.content)}
                disabled={streaming}
                className="text-left px-3 py-2 rounded-xl border border-border/60 bg-foreground/[0.03] cursor-pointer hover:bg-foreground/[0.06] disabled:opacity-40 disabled:cursor-default transition-colors"
              >
                <span className="text-[10px] font-medium text-foreground/60 block mb-0.5">
                  ✨ {s.label}
                </span>
                <span className="text-[11px] leading-snug text-foreground/80 line-clamp-2">
                  {s.content}
                </span>
              </button>
            ))}
            {suggestions.length < 2 && (
              <div className="px-3 py-2 rounded-xl border border-dashed border-border/60 text-[11px] text-muted-foreground/60 flex items-center justify-center">
                {'等待剧情推进…'}
              </div>
            )}
          </>
        )}
      </div>

      {customOpen ? (
        <div className="flex items-center gap-2">
          <input
            value={customInput}
            onChange={(e) => setCustomInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleCustomSend();
              }
            }}
            autoFocus
            placeholder={`以 ${myRole || '你的角色'} 的口吻发言…`}
            className="flex-1 h-8 px-3 rounded-xl text-xs bg-background border border-border focus:outline-none focus:border-foreground/20"
          />
          <button
            onClick={handleCustomSend}
            disabled={!customInput.trim() || streaming}
            className="w-8 h-8 flex items-center justify-center rounded-xl bg-foreground text-background hover:opacity-90 transition-opacity border-none cursor-pointer disabled:opacity-30"
          >
            <Send size={12} />
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCustomOpen(true)}
          disabled={streaming}
          className="w-full text-left px-3 py-2 rounded-xl border border-dashed border-border/60 text-[11px] text-foreground/60 bg-transparent cursor-pointer hover:bg-foreground/[0.03] disabled:opacity-40 disabled:cursor-default"
        >
          ✍️ 自定义内容…
        </button>
      )}
    </div>
  );
}
