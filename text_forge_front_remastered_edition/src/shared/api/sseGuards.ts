/**
 * 阶段 4（大厂标准化）：SSE 事件运行时断言。
 *
 * 与后端 domains/agent/sse_events.py 的构造契约对齐：对关键事件做字段级
 * 运行时校验（失败仅 console.warn，不中断流式处理），提前暴露前后端契约漂移。
 */

function warn(event: string, detail: string): void {
  if (typeof console !== 'undefined') {
    console.warn(`[sseGuards] ${event} 契约异常: ${detail}`);
  }
}

/** review_card：node_id / node_label / output_preview / reason 必填，tokens/elapsed_ms 与后端契约一致 */
export function assertReviewCard(event: Record<string, unknown>): void {
  if (!event.node_id) warn('review_card', '缺少 node_id');
  if (!event.node_label) warn('review_card', '缺少 node_label');
  if (typeof event.output_preview !== 'string') warn('review_card', 'output_preview 非字符串');
  if (!event.reason) warn('review_card', '缺少 reason');
  if (event.tokens !== undefined && typeof event.tokens !== 'number') warn('review_card', 'tokens 非数字');
  if (event.elapsed_ms !== undefined && typeof event.elapsed_ms !== 'number') warn('review_card', 'elapsed_ms 非数字');
}

/** tool_end：tool / tool_call_id / success 契约 */
export function assertToolEnd(event: Record<string, unknown>): void {
  if (!event.tool) warn('tool_end', '缺少 tool');
  if (event.tool_call_id !== undefined && typeof event.tool_call_id !== 'string') warn('tool_end', 'tool_call_id 非字符串');
  if (event.success !== undefined && typeof event.success !== 'boolean') warn('tool_end', 'success 非布尔');
}

/** node_end：node_id / tokens 契约（label 不要求——N3 后端不发） */
export function assertNodeEnd(event: Record<string, unknown>): void {
  if (!event.node_id) warn('node_end', '缺少 node_id');
  if (event.tokens !== undefined && typeof event.tokens !== 'number') warn('node_end', 'tokens 非数字');
}

/** turn_metrics：2.3 嵌套契约 { type, metrics: {...} } */
export function assertTurnMetrics(event: Record<string, unknown>): void {
  const metrics = event.metrics;
  if (!metrics || typeof metrics !== 'object') {
    warn('turn_metrics', '缺少 metrics 嵌套对象');
    return;
  }
  const m = metrics as Record<string, unknown>;
  for (const k of ['llm_calls', 'tool_calls', 'tool_success', 'tool_fail', 'duration_ms']) {
    if (m[k] !== undefined && typeof m[k] !== 'number') warn('turn_metrics', `${k} 非数字`);
  }
}
