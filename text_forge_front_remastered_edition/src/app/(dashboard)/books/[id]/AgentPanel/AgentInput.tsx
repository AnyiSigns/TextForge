'use client';

/**
 * Agent 面板输入区组件。
 * 负责：textarea + 提及建议浮层（@角色/#设定）+ 工作流快捷建议 + 发送/停止按钮。
 */
import { ArrowUp, CircleStop } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/shared/lib/cn';
import type { Workflow } from '@/shared/api/workflows';

interface MentionState {
  kind: 'character' | 'setting';
  query: string;
  index: number;
  items: Array<{ label: string }>;
}

interface AgentInputProps {
  input: string;
  placeholderText: string;
  agentStreaming: boolean;
  showWorkflowSuggestions: boolean;
  workflowList: Workflow[];
  mention: MentionState | null;
  /** 1.1：由父面板（AgentPanel）持有并注入，使 @提及 应用/失焦聚焦 可作用于同一 textarea */
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onInputChange: (value: string, el: HTMLTextAreaElement) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onApplyMention: (item: { label: string }) => void;
  onMentionHover: (index: number) => void;
  onSend: () => void;
  onAbort: () => void;
  onWorkflowSelect: (wf: Workflow) => void;
}

export function AgentInput(props: AgentInputProps) {
  const {
    input, placeholderText, agentStreaming, showWorkflowSuggestions, workflowList,
    mention, inputRef, onInputChange, onKeyDown, onApplyMention, onMentionHover, onSend, onAbort, onWorkflowSelect,
  } = props;

  return (
    <div className="ide-agent-input-row">
      {showWorkflowSuggestions && (
        <div className="mb-1 mx-1 rounded-lg border border-border/60 bg-background overflow-hidden">
          <div className="px-3 py-1.5 text-[10px] text-muted-foreground/60 font-medium">我的工作流</div>
          {workflowList.map((wf) => (
            <button
              key={wf.id}
              onClick={() => onWorkflowSelect(wf)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left bg-transparent border-none cursor-pointer hover:bg-muted/50 text-xs"
            >
              <span className="text-[#1c1b1a]/60 truncate">{wf.name}</span>
              <span className="text-[10px] text-muted-foreground/40 ml-auto shrink-0">
                {wf.nodes?.length ?? 0}角色
              </span>
            </button>
          ))}
          <Link href="/workflow" className="block px-3 py-1.5 text-[10px] text-muted-foreground/40 no-underline hover:bg-muted/50 border-t border-border/30">
            管理工作流 →
          </Link>
        </div>
      )}
      <div className="relative flex-1">
        {/* @角色/#设定 提及建议浮层 */}
        {mention && mention.items.length > 0 && (
          <div className="absolute bottom-full left-0 right-0 mb-1 rounded-lg border border-border/60 bg-background shadow-xl overflow-hidden z-10">
            <div className="px-3 py-1 text-[10px] text-muted-foreground/50 border-b border-border/30">
              {mention.kind === 'character' ? '@ 角色' : '# 设定'}
            </div>
            {mention.items.slice(0, 6).map((item, i) => (
              <button
                key={item.label + i}
                onClick={() => onApplyMention(item)}
                onMouseEnter={() => onMentionHover(i)}
                className={cn(
                  'w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs cursor-pointer border-none bg-transparent',
                  i === mention.index ? 'bg-muted/60 text-foreground' : 'text-foreground/80 hover:bg-muted/40',
                )}
              >
                <span className="text-[10px] text-muted-foreground/40 w-3 text-center shrink-0">{mention.kind === 'character' ? '@' : '#'}</span>
                <span className="truncate">{item.label}</span>
              </button>
            ))}
          </div>
        )}
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => onInputChange(e.target.value, e.target)}
          onKeyDown={onKeyDown}
          placeholder={placeholderText}
          rows={1}
          className={cn(
            'w-full pl-3.5 pr-9 py-2.5 bg-muted/50 border focus:bg-background focus:outline-none transition-all text-[13px] placeholder:text-muted-foreground/50 disabled:opacity-50 resize-none min-h-[40px]',
            agentStreaming
              ? 'border-solid border-transparent [border-image:linear-gradient(135deg,color-mix(in_srgb,var(--foreground)_16%,transparent),color-mix(in_srgb,var(--foreground)_4%,transparent),color-mix(in_srgb,var(--foreground)_10%,transparent))_1] shadow-[0_0_12px_2px_color-mix(in_srgb,var(--foreground)_3%,transparent)]'
              : 'border-border/50 focus:border-foreground/20',
          )}
        />
        {agentStreaming ? (
          <button onClick={onAbort} className="absolute right-1.5 bottom-1.5 w-6 h-6 flex items-center justify-center bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)] text-foreground/60 hover:text-foreground hover:bg-[color-mix(in_srgb,var(--foreground)_14%,transparent)] border-none cursor-pointer rounded-full transition-all">
            <CircleStop size={15} strokeWidth={1.8} />
          </button>
        ) : (
          <button onClick={onSend} disabled={!input.trim()}
            className={cn(
              'absolute right-1.5 bottom-1.5 w-6 h-6 flex items-center justify-center border-none cursor-pointer transition-all',
              input.trim()
                ? 'text-foreground/60 hover:text-foreground'
                : 'text-muted-foreground/30 cursor-default',
            )}>
            <ArrowUp size={15} strokeWidth={2} />
          </button>
        )}
      </div>
    </div>
  );
}
