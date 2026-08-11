'use client';

/**
 * 任务 25：Agent 相关 window CustomEvent 总线收敛为类型安全的事件工具。
 *
 * 把散落各处的 `window.dispatchEvent(new CustomEvent('textforge:...'))` /
 * `addEventListener` 收敛为带 payload 类型的 emit/on 一对，避免字符串事件名
 * 拼写错误与 payload 结构漂移。底层仍是 window CustomEvent（跨组件通信），
 * 不引入额外依赖。
 */

/** 事件 → payload 类型映射（null 表示无 payload）。*/
export interface AgentEventMap {
  /** 会话列表需要刷新（新会话/删除后） */
  'textforge:refresh-agent-sessions': null;
  /** 会话标题更新（自动生成 / 手动重命名） */
  'textforge:agent-title': { threadId: string; title: string };
  /** 大纲需要刷新（agent 调用了 outline 类工具） */
  'textforge:refresh-outlines': null;
  /** 章节正文被 Agent 落库（write_chapter_content 审批执行成功），手稿编辑器刷新当前章 */
  'textforge:refresh-chapter-content': null;
}

export type AgentEventName = keyof AgentEventMap;
type AgentEventPayload<K extends AgentEventName> = AgentEventMap[K] extends null
  ? undefined
  : AgentEventMap[K];

function dispatchEvent<K extends AgentEventName>(name: K, payload: AgentEventPayload<K>): void {
  if (typeof window === 'undefined') return;
  const detail = payload === null || payload === undefined ? {} : payload;
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

function addEventListener<K extends AgentEventName>(
  name: K,
  handler: (payload: AgentEventPayload<K>) => void,
): () => void {
  const listener = (e: Event) => {
    const detail = (e as CustomEvent).detail;
    handler((detail ?? {}) as AgentEventPayload<K>);
  };
  window.addEventListener(name, listener);
  return () => window.removeEventListener(name, listener);
}

/** 便捷方法：刷新会话列表 */
export function emitAgentSessionsRefresh(): void {
  dispatchEvent('textforge:refresh-agent-sessions', undefined);
}

/** 便捷方法：更新会话标题 */
export function emitAgentTitle(threadId: string, title: string): void {
  dispatchEvent('textforge:agent-title', { threadId, title });
}

/** 便捷方法：刷新大纲树 */
export function emitAgentOutlinesRefresh(): void {
  dispatchEvent('textforge:refresh-outlines', undefined);
}

/** 便捷方法：章节内容被 Agent 落库，通知手稿编辑器刷新当前章（消费方按 activeChapterId 刷新，无需载荷） */
export function emitAgentChapterContentRefresh(): void {
  dispatchEvent('textforge:refresh-chapter-content', undefined);
}

/** 便捷方法：监听会话列表刷新 */
export function onAgentSessionsRefresh(handler: () => void): () => void {
  return addEventListener('textforge:refresh-agent-sessions', handler);
}

/** 便捷方法：监听会话标题更新 */
export function onAgentTitle(handler: (payload: { threadId: string; title: string }) => void): () => void {
  return addEventListener('textforge:agent-title', handler);
}

/** 便捷方法：监听大纲刷新 */
export function onAgentOutlinesRefresh(handler: () => void): () => void {
  return addEventListener('textforge:refresh-outlines', handler);
}

/** 便捷方法：监听章节内容刷新 */
export function onAgentChapterContentRefresh(handler: () => void): () => void {
  return addEventListener('textforge:refresh-chapter-content', handler);
}
