// src/lib/aiTextTransform.ts
// AI 文本辅助的纯变换（mock 期本地占位；后端期可替换为 SSE 调用）。
// 跨 useWorkbench / useManuscriptEditor 共用，保证两端文案与行为一致。
export type AiAction = 'expand' | 'rewrite' | 'summarize';

export function transformText(action: AiAction, text: string): string {
  if (action === 'expand') {
    return `${text}\n\n（扩写）${text}`;
  }
  if (action === 'rewrite') {
    return `（改写）${text}`;
  }
  // summarize
  return text.length > 120 ? `${text.slice(0, 120)}…（缩写）` : text;
}

export const AI_ACTION_LABEL: Record<AiAction, string> = {
  expand: '扩写',
  rewrite: '改写',
  summarize: '缩写',
};
