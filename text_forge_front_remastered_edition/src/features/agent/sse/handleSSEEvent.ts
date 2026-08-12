'use client';

import { useBookDetailStore } from '@/app/(dashboard)/books/[id]/store';
import { emitAgentChapterContentRefresh, emitAgentTitle } from '../agentEvents';
import type { SSEEvent } from '@/shared/api/types';
import { assertNodeEnd, assertReviewCard, assertToolEnd, assertTurnMetrics } from '@/shared/api/sseGuards';

type Store = ReturnType<typeof useBookDetailStore.getState>;

/** SSE 处理器注入的依赖集合（store 写入 + 回合级 refs）。 */
export interface SSEHandlerContext {
  addAgentMessage: Store['addAgentMessage'];
  setPendingReview: Store['setPendingReview'];
  setAgentStatus: Store['setAgentStatus'];
  setAgentReasoning: Store['setAgentReasoning'];
  commitStreamingMessage: Store['commitStreamingMessage'];
  upsertNodeStatus: Store['upsertNodeStatus'];
  updateToolMessage: Store['updateToolMessage'];
  updateNodeMessage: Store['updateNodeMessage'];
  flushTokens: () => void;
  scheduleToken: (token: string) => void;
  scheduleNodeOutput: (nodeId: string, token: string) => void;
  flushNodeOutputs: () => void;
  thinkingStartRef: { current: number };
  reasoningBufferRef: { current: string };
  currentToolRef: { current: Set<string> };
  currentToolNameRef: { current: string };
  replyRef: { current: string };
}

/**
 * SSE 事件处理工厂：注入 store 写入依赖与回合级 refs，返回纯事件处理器。
 * 语义与拆分前 useAgentSender 内的巨型 switch 1:1 保留（事件名/字段契约/UI 文案均未改动）。
 */
export function createSSEHandler(ctx: SSEHandlerContext): (event: SSEEvent) => void {
  return (event: SSEEvent): void => {
    switch (event.type) {
      case 'think_start':
        ctx.thinkingStartRef.current = Date.now();
        ctx.reasoningBufferRef.current = '';
        ctx.setAgentReasoning('');
        ctx.setAgentStatus({ kind: 'thinking' });
        break;
      case 'token':
      case 'agent_token': {
        // agent_token 为单通道模式下的正文流式事件（与原 token 事件同语义）
        const token = event.token || '';
        if (token) {
          ctx.scheduleToken(token);
        }
        break;
      }
      case 'agent_reasoning':
        // 思考内容流式累积进独立气泡（不写入会话历史，只做 UI 展示）
        ctx.reasoningBufferRef.current += event.token || '';
        ctx.setAgentReasoning(ctx.reasoningBufferRef.current);
        ctx.setAgentStatus({ kind: 'thinking' });
        break;
      case 'agent_think_end':
        ctx.setAgentStatus({ kind: 'idle' });
        ctx.thinkingStartRef.current = 0;
        break;
      case 'tool_start': {
        // 工具调用以独立卡片消息插入消息流（顺序天然正确：工具在回复前开始，
        // 卡片就出现在回复之前），不再依赖消息流外单独渲染的状态条。
        ctx.flushTokens();
        const toolName = event.tool || '';
        const toolCallId = event.tool_call_id || '';
        ctx.currentToolNameRef.current = toolName;
        // 定型当前流式回复（若有），再插入工具卡片，之后新回复从卡片后继续
        ctx.commitStreamingMessage();
        ctx.replyRef.current = '';
        ctx.addAgentMessage({
          role: 'assistant',
          type: 'tool',
          tool: toolName,
          toolCallId,
          toolStatus: 'running',
          content: '',
        });
        ctx.currentToolRef.current.add(toolName);
        break;
      }
      case 'tool_end': {
        // 优先用事件里的 tool_call_id 配对；兼容旧后端（不带 id）时
        // 按最近记录的 tool_start 工具名回退。success=false 表示工具失败。
        assertToolEnd(event as unknown as Record<string, unknown>);
        const toolName = event.tool || ctx.currentToolNameRef.current;
        const toolCallId = event.tool_call_id || '';
        const success = (event as { success?: boolean }).success;
        ctx.currentToolNameRef.current = '';
        // success=false 时置 error，使「工具执行失败」状态真正可达（否则 toolStatus 的
        // error 分支只会在 abort 时触发，失败语义全靠 toolSuccess 表达）。
        ctx.updateToolMessage(toolName, success === false ? 'error' : 'done', {
          toolCallId: toolCallId || undefined,
          success,
        });
        // 1.4（v5）：write_chapter_content 审批执行成功 → 通知手稿编辑器刷新当前章内容
        if (toolName === 'write_chapter_content' && success) {
          emitAgentChapterContentRefresh();
        }
        break;
      }
      case 'node_start': {
        ctx.flushTokens();
        const nodeId = event.node_id || event.label || '';
        const label = event.label || nodeId;
        ctx.setAgentStatus({ kind: 'working', label: `正在执行: ${label}` });
        ctx.upsertNodeStatus({ nodeId, label, status: 'running' });
        // 节点卡片同样作为独立消息插入消息流，紧跟触发它的工具卡片之后
        ctx.addAgentMessage({
          role: 'assistant',
          type: 'node',
          nodeId,
          label,
          nodeStatus: 'running',
          content: '',
        });
        break;
      }
      case 'node_stream': {
        // 事件只有 node_id（无 label），按 nodeId 累积到 nodeOutputs（状态卡片展开时在卡片内部展示）
        const nodeId = event.node_id || '';
        // N9：rAF 批处理，减少 store 写入次数
        ctx.scheduleNodeOutput(nodeId, event.token || '');
        break;
      }
      case 'node_end': {
        // N9：先冲刷未落库的 node_stream 缓冲，再读取 nodeOutputs 固化卡片内容
        ctx.flushNodeOutputs();
        // N3：node_end 事件不带 label（后端仅 node_id/output_preview/tokens），
        // 仅在 event.label 存在时才更新 label，避免用 nodeId 覆盖 node_start 的友好标签
        assertNodeEnd(event as unknown as Record<string, unknown>);
        const nodeId = event.node_id || '';
        const label = (event as { label?: string }).label;
        ctx.upsertNodeStatus({ nodeId, label, status: 'completed', tokens: event.tokens });
        ctx.updateNodeMessage(nodeId, { label, nodeStatus: 'completed', tokens: event.tokens });
        // 把流式累积的节点输出固化到节点卡片消息自身（content），
        // 否则新消息开始时 clearNodeOutputs() 会清空 nodeOutputs，卡片展开只剩「暂无输出」。
        const accumulated = useBookDetailStore.getState().nodeOutputs?.[nodeId] || '';
        if (accumulated) {
          ctx.updateNodeMessage(nodeId, { content: accumulated });
        }
        break;
      }
      case 'node_fail': {
        // N9：先冲刷未落库的 node_stream 缓冲
        ctx.flushNodeOutputs();
        // 节点失败必须让用户看到，不能静默
        const nodeId = event.node_id || '';
        const label = (event as { label?: string }).label;
        const reason = event.reason || '';
        ctx.upsertNodeStatus({ nodeId, label, status: 'failed', reason });
        ctx.updateNodeMessage(nodeId, { label, nodeStatus: 'failed', reason });
        // 失败节点固化已流式内容（node_end 同款处理），
        // 否则新消息开始时 clearNodeOutputs() 清空 nodeOutputs，卡片只剩「暂无输出」。
        const accumulated = useBookDetailStore.getState().nodeOutputs?.[nodeId] || '';
        if (accumulated) {
          ctx.updateNodeMessage(nodeId, { content: accumulated });
        }
        ctx.addAgentMessage({
          role: 'assistant',
          type: 'error',
          content: `工作流节点失败：${label || nodeId}${reason ? `（${reason}）` : ''}`,
        });
        ctx.setAgentStatus({ kind: 'error', message: `节点 ${label || nodeId} 执行失败` });
        break;
      }
      case 'extend_outline':
        ctx.setAgentStatus({ kind: 'working', label: '追加章节大纲中...' });
        break;
      case 'subgraph_start':
        // supervisor 路由事件：显示「正在进入 xx 阶段」徽标
        ctx.setAgentStatus({
          kind: 'working',
          label: event.label ? `正在进入「${event.label}」阶段` : '正在进入创作子图',
        });
        break;
      case 'progress':
        // 区分 build_outline（建大纲 N/M）与 generate_chapter（生成章节 N/M）
        if ((event as { step?: string }).step === 'build_outline') {
          const label = (event as { label?: string }).label || '';
          ctx.setAgentStatus({
            kind: 'working',
            label: (event as { total?: number }).total
              ? `正在建大纲 ${event.n ?? 0}/${event.total}${label ? `：${label}` : ''}...`
              : '正在建大纲...',
          });
        } else {
          ctx.setAgentStatus({
            kind: 'working',
            label: (event as { n?: number; total?: number }).total
              ? `生成章节中 ${event.n ?? 0}/${event.total}...`
              : '生成章节中...',
          });
        }
        break;
      case 'turn_metrics': {
        // 回合指标事件——仅作调试/日志展示，不影响 UI 状态
        // 2.3：契约统一为嵌套结构 { type, metrics }
        assertTurnMetrics(event as unknown as Record<string, unknown>);
        break;
      }
      case 'review_card': {
        // 2.2/2.12：契约断言（tokens/elapsed_ms 字段） + live 卡片（可操作）
        assertReviewCard(event as unknown as Record<string, unknown>);
        ctx.setAgentStatus({ kind: 'working', label: '等待审核...' });
        ctx.setPendingReview(event as unknown as Record<string, unknown>);
        ctx.addAgentMessage({
          role: 'assistant',
          content: '',
          type: 'review-card',
          token: JSON.stringify(event),
          live: true,
        });
        // 门控写工具被拦截期间后端不发 tool_end，工具卡会一直「请求外援中」；
        // 审核卡到达时把匹配的门控写工具卡（写工具卡 node_id == 工具名）置 pending，
        // 文案改为「等待审核」，避免「仍在执行」的误导（工作流审核卡 node_id 是
        // 节点 id，不匹配任何工具卡，自然跳过）。
        const gatedTool = (event as { node_id?: string }).node_id || '';
        if (gatedTool) {
          useBookDetailStore.setState((s) => ({
            agentMessages: s.agentMessages.map((m) =>
              m.type === 'tool' && m.tool === gatedTool && m.toolStatus === 'running'
                ? { ...m, toolStatus: 'pending' as const }
                : m,
            ),
          }));
        }
        break;
      }
      case 'suggestions': {
        // 创作建议必须展示给用户（后端每条回复后都会推送）
        const items = event.items;
        if (Array.isArray(items) && items.length > 0) {
          const lines = items
            .map((it) => {
              const typeLabel: Record<string, string> = {
                summary_missing: '章节缺少摘要',
                foreshadowing_due: '伏笔待回收',
                plot_thread_stalled: '情节线停滞',
                pacing_imbalance: '节奏失衡',
              };
              const label = typeLabel[it?.type || ''] || it?.type || '建议';
              const message = it?.message || it?.suggestion || '';
              return `· ${label}：${message}`;
            })
            .join('\n');
          ctx.addAgentMessage({ role: 'assistant', type: 'suggestions', content: `**创作建议**\n${lines}` });
        }
        break;
      }
      case 'title_update':
        // title_update 是会话标题唯一通道（end 事件不携带 title，
        // 后端契约已确认），统一走 agentEvents 分发避免双通道分歧。
        if (event.thread_id && event.title) {
          emitAgentTitle(event.thread_id, event.title);
        }
        break;
    }
  };
}
