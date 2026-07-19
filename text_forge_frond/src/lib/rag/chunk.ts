// src/lib/rag/chunk.ts
//
// 文本分块：把长文档切成适合中文语义检索的小段。
// 小说场景：每段 ~400 字、20% 重叠，保证一段是一个相对完整的语义单元
// （人物小传 / 场景描写 / 情节片段），避免切断上下文导致检索漏召。
//
// 切分优先级：
//   1) 按空行/标题分段（保留自然段落边界）
//   2) 超长段再按句号等标点滑动窗口切开（带重叠）

const TARGET_CHUNK = 400;     // 目标每段字数
const OVERLAP = 0.2;          // 重叠比例
const MIN_CHUNK = 80;         // 太短无意义，丢弃
const HARD_MAX = 600;         // 单段硬上限，避免极端长段

function splitByParagraphs(text: string): string[] {
  return text
    .split(/\n{2,}|\n/)          // 空行或单换行视为段落分隔
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 0);
}

// 在标点处断句，滑动窗口切块（带重叠）
function slideChunk(paragraph: string): string[] {
  if (paragraph.length <= HARD_MAX) return [paragraph];

  const pieces: string[] = [];
  let start = 0;
  while (start < paragraph.length) {
    let end = Math.min(start + TARGET_CHUNK, paragraph.length);
    // 不在句中断开：向前找最近的标点
    if (end < paragraph.length) {
      const slice = paragraph.slice(start, end);
      const lastPunct = Math.max(
        slice.lastIndexOf('。'),
        slice.lastIndexOf('！'),
        slice.lastIndexOf('？'),
        slice.lastIndexOf('；'),
        slice.lastIndexOf('，'),
        slice.lastIndexOf('. '),
        slice.lastIndexOf('! '),
        slice.lastIndexOf('? '),
      );
      if (lastPunct > TARGET_CHUNK * 0.5) end = start + lastPunct + 1;
    }
    const piece = paragraph.slice(start, end).trim();
    if (piece.length >= MIN_CHUNK) pieces.push(piece);
    const step = Math.max(1, Math.floor(TARGET_CHUNK * (1 - OVERLAP)));
    start += step;
  }
  return pieces;
}

export function chunkDocument(text: string): string[] {
  const paras = splitByParagraphs(text);
  const out: string[] = [];
  for (const p of paras) {
    if (p.length <= HARD_MAX) {
      if (p.length >= MIN_CHUNK) out.push(p);
    } else {
      out.push(...slideChunk(p));
    }
  }
  return out.length ? out : [text.slice(0, HARD_MAX).trim()];
}

// 轻量摘要：从一段长文本取前几句/前若干字，作为向量检索的 query。
// 零成本、不依赖模型——用于"自动搜"模式下把节点上下文压成检索问句。
export function lightSummary(text: string, maxChars = 120): string {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (cleaned.length <= maxChars) return cleaned;
  const head = cleaned.slice(0, maxChars);
  // 优先在标点处截断，避免半句
  const cut = Math.max(
    head.lastIndexOf('。'),
    head.lastIndexOf('！'),
    head.lastIndexOf('？'),
    head.lastIndexOf('；'),
  );
  return (cut > maxChars * 0.5 ? head.slice(0, cut + 1) : head).trim();
}
