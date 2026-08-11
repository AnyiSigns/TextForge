'use client';

/**
 * 任务 25：消息渲染的 type→组件映射字典。
 *
 * 原 renderAgentMessage 的 10 分支收敛为组件映射表 + 兜底文本渲染，
 * 独立文件便于单测；同时修复历史遗留问题：
 * - node-output 旧消息不再渲染（已迁移到节点卡片内部）
 * - review-card / propose-cards 的 JSON 解析容错与空数据兜底
 */
import { ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/cn';
import { ReviewCard } from './ReviewCard';
import type { AgentMessage } from '../store';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function MarkdownContent({ children }: { children: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children: c }) => <p className="my-1 first:mt-0 last:mb-0">{c}</p>,
        strong: ({ children: c }) => <strong className="font-semibold">{c}</strong>,
        em: ({ children: c }) => <em className="italic">{c}</em>,
        ul: ({ children: c }) => <ul className="list-disc pl-4 my-1 space-y-0.5">{c}</ul>,
        ol: ({ children: c }) => <ol className="list-decimal pl-4 my-1 space-y-0.5">{c}</ol>,
        li: ({ children: c }) => <li>{c}</li>,
        code: ({ children: c, className: cls }) => {
          const isInline = !cls;
          return isInline ? (
            <code className="px-1 py-0.5 bg-foreground/10 text-[12px]">{c}</code>
          ) : (
            <code className="block my-1 p-2 bg-foreground/5 text-[12px] overflow-x-auto whitespace-pre-wrap">{c}</code>
          );
        },
        pre: ({ children: c }) => <pre className="my-1">{c}</pre>,
        blockquote: ({ children: c }) => (
          <blockquote className="border-l-2 border-foreground/15 pl-3 my-1 italic text-muted-foreground/80">{c}</blockquote>
        ),
        hr: () => <hr className="my-2 border-foreground/10" />,
        h1: ({ children: c }) => <h1 className="text-[15px] font-semibold my-2">{c}</h1>,
        h2: ({ children: c }) => <h2 className="text-[14px] font-semibold my-1.5">{c}</h2>,
        h3: ({ children: c }) => <h3 className="text-[13px] font-semibold my-1">{c}</h3>,
      }}
    >
      {children}
    </ReactMarkdown>
  );
}

export function safeParseJSON(str: string): unknown {
  try { return JSON.parse(str); } catch { return null; }
}

export interface MessageItemProps {
  msg: AgentMessage;
  index: number;
  expandedNodeCards: Set<string>;
  onToggleNode: (nodeId: string) => void;
  nodeOutputs: Record<string, string>;
  agentStreaming: boolean;
  agentStatusKind: 'idle' | 'thinking' | 'working' | 'error';
  onReviewAction: (action: 'accept' | 'retry' | 'edit' | 'terminate', editedContent?: string, chapterId?: number) => void;
  onSendMessage: (msg: string) => void;
  onCopy: (text: string) => void;
  onEditSend: (msg: AgentMessage) => void;
  onUnlockAndRetry: (retryMessage: string) => void;
}

/** 工具卡片：running 显示「请求外援中」，done 显示「外援已找到 ✓」，失败显示失败样式。 */
function ToolCard({ msg }: { msg: Extract<AgentMessage, { type: 'tool' }> }) {
  const running = msg.toolStatus === 'running';
  const failed = msg.toolStatus === 'error' || msg.toolSuccess === false;
  return (
    <div className="flex justify-start">
      <div className="mx-1 mb-1 flex items-center gap-2 rounded-lg border border-border/40 bg-background/40 px-3 py-1.5 text-[11px]">
        {running ? (
          <>
            <span className="thinking-shimmer-text">{msg.tool === 'execute_workflow' || msg.tool === 'execute_workflow_node' ? '执行工作流中' : '请求外援中'}</span>
            <span className="ml-auto inline-block h-3.5 w-3.5 shrink-0 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground/70" />
          </>
        ) : failed ? (
          <>
            <span className="text-destructive/80">{msg.tool === 'execute_workflow' || msg.tool === 'execute_workflow_node' ? '工作流已中断' : '工具执行失败'}</span>
            <span className="ml-auto text-destructive/70">✗</span>
          </>
        ) : (
          <>
            <span className="text-foreground/60">{msg.tool === 'execute_workflow' || msg.tool === 'execute_workflow_node' ? '工作流已启动' : '外援已找到'}</span>
            <span className="ml-auto text-foreground/70">✓</span>
          </>
        )}
      </div>
    </div>
  );
}

/** 节点卡片：状态（running/completed/failed）+ 展开时展示 nodeOutputs 正文。 */
function NodeCard({
  msg,
  expanded,
  onToggle,
  nodeOutputs,
}: {
  msg: Extract<AgentMessage, { type: 'node' }>;
  expanded: boolean;
  onToggle: () => void;
  nodeOutputs: Record<string, string>;
}) {
  return (
    <div className="flex justify-start">
      <div className="w-full rounded-lg border border-border/40 bg-background/40 overflow-hidden">
        <button
          onClick={onToggle}
          className="w-full flex items-center gap-2 px-3 py-1.5 text-[11px] bg-transparent border-none cursor-pointer hover:bg-muted/40 text-left"
        >
          {msg.nodeStatus === 'running' ? (
            <>
              <span className="thinking-shimmer-text">{msg.label}</span>
              <span className="ml-auto inline-block h-3 w-3 shrink-0 animate-spin rounded-full border-2 border-foreground/30 border-t-foreground/70" />
            </>
          ) : msg.nodeStatus === 'completed' ? (
            <>
              <span className="text-foreground/70">{msg.label}</span>
              {msg.tokens !== undefined && (
                <span className="text-[10px] text-foreground/30 tabular-nums">{msg.tokens}t</span>
              )}
              <span className="ml-auto text-foreground/60">✓ 完成</span>
            </>
          ) : (
            <>
              <span className="text-red-500/70">{msg.label}</span>
              <span className="ml-auto text-red-500/60">✗ 失败</span>
            </>
          )}
          <ChevronDown size={11} strokeWidth={1.5} className={cn('shrink-0 text-foreground/30 transition-transform', expanded && 'rotate-180')} />
        </button>
        {expanded && (
          <div className="px-3 pb-2 space-y-1">
            {msg.nodeStatus === 'failed' && msg.reason && (
              <div className="text-[10px] text-red-500/60">失败原因：{msg.reason}</div>
            )}
            {msg.nodeStatus === 'completed' && msg.tokens !== undefined && (
              <div className="text-[10px] text-foreground/35">输出 {msg.tokens} tokens</div>
            )}
            {msg.nodeId && (msg.content || nodeOutputs[msg.nodeId]) ? (
              <div className="max-h-64 overflow-y-auto rounded-md border-l-2 border-foreground/15 bg-[#1c1b1a]/[0.02] px-2.5 py-2 text-[12px] leading-relaxed text-foreground/70">
                <MarkdownContent>{msg.content || nodeOutputs[msg.nodeId]}</MarkdownContent>
              </div>
            ) : msg.nodeStatus === 'running' ? (
              <div className="text-[11px] text-foreground/30">节点执行中，正文实时生成…</div>
            ) : (
              <div className="text-[10px] text-foreground/25">暂无输出</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 错误消息：附带「重试」按钮（503 锁冲突时显示「解除占用并重试」）。 */
function ErrorMessage({ msg, onUnlockAndRetry }: {
  msg: Extract<AgentMessage, { type: 'error' }>;
  onUnlockAndRetry: (retryMessage: string) => void;
}) {
  return (
    <div className="text-[11px] text-destructive/80 px-3 py-1.5 bg-destructive/[0.04] border border-destructive/10">
      <div>{msg.content}</div>
      {msg.retryMessage && (
        <button
          onClick={() => { void onUnlockAndRetry(msg.retryMessage!); }}
          className="mt-1.5 text-[11px] px-2 py-0.5 rounded-md border border-destructive/30 text-destructive/90 bg-transparent hover:bg-destructive/10 cursor-pointer transition-colors"
        >
          {msg.content.includes('解除占用') ? '解除占用并重试' : '重试'}
        </button>
      )}
    </div>
  );
}

/** 流式消息：正文 + 三点脉冲 / 正在酝酿指示。 */
function StreamingMessage({ msg, isThinking, agentStreaming }: {
  msg: Extract<AgentMessage, { type: 'streaming' }>;
  isThinking: boolean;
  agentStreaming: boolean;
}) {
  const hasContent = !!msg.content;
  return (
    <div className="flex justify-start">
      <div className="max-w-[88%] px-3 py-2 border-l-2 border-foreground/10 text-[13px] leading-relaxed">
        {hasContent && <MarkdownContent>{msg.content}</MarkdownContent>}
        {agentStreaming && (
          <div className={cn('flex', hasContent && 'mt-1.5')}>
            {isThinking ? (
              <span className="thinking-shimmer-text">正在酝酿</span>
            ) : (
              <span className="inline-flex gap-0.5">
                <span className="w-1 h-1 rounded-full bg-foreground/30 animate-pulse" style={{ animationDelay: '0ms' }} />
                <span className="w-1 h-1 rounded-full bg-foreground/30 animate-pulse" style={{ animationDelay: '200ms' }} />
                <span className="w-1 h-1 rounded-full bg-foreground/30 animate-pulse" style={{ animationDelay: '400ms' }} />
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 普通文本消息（user / assistant / system / suggestions）：支持 hover 复制/编辑重发。 */
function TextMessage({ msg, onCopy, onEditSend }: {
  msg: AgentMessage;
  onCopy: (text: string) => void;
  onEditSend: (msg: AgentMessage) => void;
}) {
  return (
    <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
      <div className={cn(
        'max-w-[88%] text-[13px] leading-relaxed group relative',
        msg.role === 'user'
          ? 'rounded-2xl bg-[color-mix(in_srgb,var(--foreground)_12%,transparent)] text-foreground/85 backdrop-blur-sm px-3.5 py-1.5'
          : 'px-3 py-2 border-l-2 border-foreground/10 agent-markdown',
      )}>
        {msg.role === 'user' ? msg.content : <MarkdownContent>{msg.content}</MarkdownContent>}
        {/* 任务 23：消息 hover 菜单——复制（assistant 复制正文）/ 编辑重发（user 消息回填输入框） */}
        <div className="absolute -top-3 right-0 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {msg.role === 'assistant' && msg.content && (
            <button
              onClick={() => { void onCopy(msg.content); }}
              className="h-5 px-1.5 rounded text-[10px] bg-background border border-border/60 text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1"
              title="复制内容"
            >
              复制
            </button>
          )}
          {msg.role === 'user' && msg.content && (
            <button
              onClick={() => onEditSend(msg)}
              className="h-5 px-1.5 rounded text-[10px] bg-background border border-border/60 text-muted-foreground hover:text-foreground cursor-pointer flex items-center gap-1"
              title="编辑并重新发送"
            >
              编辑重发
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * 任务 25：type→组件映射字典。
 * key 为消息 type；未匹配（普通 user/assistant 文本）走兜底 TextMessage。
 * 数组内顺序即优先级（旧 node-output 消息显式丢弃）。
 */
const MESSAGE_RENDERERS: Record<string, (props: MessageItemProps) => React.ReactNode> = {
  'review-card': (props) => {
    const msg = props.msg;
    if (msg.type !== 'review-card' || !msg.token) return null;
    const reviewData = safeParseJSON(msg.token);
    return reviewData ? (
      <ReviewCard
        key={`${msg.id || 'rc'}-${props.index}`}
        data={reviewData as Record<string, unknown>}
        onAction={props.onReviewAction}
        // 2.12：历史回放卡只读（live:false 不渲染操作按钮）
        disabled={msg.live === false}
      />
    ) : null;
  },
  tool: (props) => {
    const msg = props.msg as Extract<AgentMessage, { type: 'tool' }>;
    return <ToolCard key={msg.id || `t-${props.index}`} msg={msg} />;
  },
  node: (props) => {
    const msg = props.msg as Extract<AgentMessage, { type: 'node' }>;
    return (
      <NodeCard
        key={msg.id || `n-${props.index}`}
        msg={msg}
        expanded={props.expandedNodeCards.has(msg.nodeId || '')}
        onToggle={() => props.onToggleNode(msg.nodeId || '')}
        nodeOutputs={props.nodeOutputs}
      />
    );
  },
  streaming: (props) => {
    const msg = props.msg as Extract<AgentMessage, { type: 'streaming' }>;
    return (
      <StreamingMessage
        key={msg.id || `s-${props.index}`}
        msg={msg}
        isThinking={props.agentStreaming && props.agentStatusKind === 'thinking'}
        agentStreaming={props.agentStreaming}
      />
    );
  },
  error: (props) => {
    const msg = props.msg as Extract<AgentMessage, { type: 'error' }>;
    return <ErrorMessage key={msg.id || `e-${props.index}`} msg={msg} onUnlockAndRetry={props.onUnlockAndRetry} />;
  },
  // 旧 node-output 消息已迁移到节点卡片内部，不渲染（避免与节点卡片重复）。
  'node-output': () => null,
};

export function MessageItem(props: MessageItemProps) {
  const { msg } = props;
  // 稳定 key（任务 22）：消息插入时生成的 id 优先，历史映射消息回退 index。
  // key 放在外层容器，保证 React 按消息身份复用/卸载而非按 index。
  const stableKey = msg.id || `i-${props.index}`;
  const renderer = MESSAGE_RENDERERS[msg.type || ''];
  const content = renderer ? renderer(props) : <TextMessage key={stableKey} msg={msg} onCopy={props.onCopy} onEditSend={props.onEditSend} />;
  return <div key={stableKey}>{content}</div>;
}
