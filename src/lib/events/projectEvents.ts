// src/lib/events/projectEvents.ts
// 轻量跨组件事件：大纲/灵感/角色图 → 项目工作台，避免引入额外 store。
export const INSERT_STEP_EVENT = 'textforge:insert-step';
export const INSERT_OUTLINE_NOTE_EVENT = 'textforge:insert-outline-note';

// 角色图插入的二级定位目标（不指定则统一发到工作台最新）
export type InsertTarget =
  | { kind: 'chapter'; stepId: string }
  | { kind: 'outline'; volumeId: string; chapterId: string; nodeId: string };

export interface InsertStepDetail {
  projectId: string;
  title: string;
  content: string;
  target?: InsertTarget;
}

export interface InsertOutlineNoteDetail {
  projectId: string;
  volumeId: string;
  chapterId: string;
  nodeId: string;
  content: string;
}

export function dispatchInsertStep(detail: InsertStepDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(INSERT_STEP_EVENT, { detail }));
}

export function onInsertStep(handler: (detail: InsertStepDetail) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => handler((e as CustomEvent<InsertStepDetail>).detail);
  window.addEventListener(INSERT_STEP_EVENT, listener);
  return () => window.removeEventListener(INSERT_STEP_EVENT, listener);
}

export function dispatchInsertOutlineNote(detail: InsertOutlineNoteDetail): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(INSERT_OUTLINE_NOTE_EVENT, { detail }));
}

export function onInsertOutlineNote(handler: (detail: InsertOutlineNoteDetail) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const listener = (e: Event) => handler((e as CustomEvent<InsertOutlineNoteDetail>).detail);
  window.addEventListener(INSERT_OUTLINE_NOTE_EVENT, listener);
  return () => window.removeEventListener(INSERT_OUTLINE_NOTE_EVENT, listener);
}
