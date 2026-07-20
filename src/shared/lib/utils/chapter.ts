// src/lib/utils/chapter.ts
// 从章节内容里提取章节标题（如「第一章：星海初现」），提取不到则回退 agent 标签。
// 同时生成「第 N 章：标题」的展示标签，过长截断为 …
import { builtinAgentLabel } from '@/shared/lib/agentRoles';

function extractChapterTitle(content?: string): string | null {
  if (!content) return null;
  const firstLine = content
    .split('\n')
    .map((l) => l.trim())
    .find((l) => l.length > 0);
  if (!firstLine) return null;
  // 匹配：第一章：星海初现 / 第1章 星海初现 / 第一章 星海初现 / 1. 星海初现
  const m = firstLine.match(/^(第[一二三四五六七八九十百\d]+[章回节卷集部篇])\s*[:：]?\s*(.*)$/);
  if (m) {
    const title = (m[2] || '').trim();
    return title ? `${m[1]}：${title}` : m[1];
  }
  // 标题风格「1. 星海初现」
  const m2 = firstLine.match(/^(\d+)\.\s*(.+)$/);
  if (m2) return `${m2[1]}. ${m2[2].trim()}`;
  // 否则取首行前若干字作为标题
  return firstLine.length > 16 ? `${firstLine.slice(0, 15)}…` : firstLine;
}

export function chapterLabel(
  agent: string | undefined,
  index: number,
  content?: string,
): { full: string; short: string } {
  const cn = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  const num = index + 1;
  const zh = num <= 10 ? cn[num] : String(num);

  const title = extractChapterTitle(content) ?? builtinAgentLabel(agent) ?? '未命名';
  const full = `第${zh}章：${title}`;
  const short = full.length > 14 ? `${full.slice(0, 13)}…` : full;
  return { full, short };
}
