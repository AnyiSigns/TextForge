// tests/rag/chunk.test.ts
// RAG 文本分块纯函数测试：chunkDocument
// 覆盖：短文本原样返回、段落保留、超长段标点处切分、重叠滑动、过短段落丢弃、兜底分支
import { describe, expect, it } from 'vitest';
import { chunkDocument } from '@/lib/rag/chunk';

describe('chunkDocument', () => {
  it('空文本返回硬上限截断的兜底片段', () => {
    const out = chunkDocument('');
    expect(out).toEqual(['']);
  });

  it('短于硬上限的文本按段落保留（压缩空白）', () => {
    // 每段超过 MIN_CHUNK(80) 时按段落原样保留
    const out = chunkDocument('第一段。'.repeat(25) + '\n\n' + '第二段。'.repeat(25));
    expect(out).toHaveLength(2);
    expect(out[0]).toBe('第一段。'.repeat(25));
    expect(out[1]).toBe('第二段。'.repeat(25));
  });

  it('全部段落都过短时走兜底分支：原文压缩空白后返回', () => {
    const out = chunkDocument('第一段。\n\n  第二段。  ');
    expect(out).toEqual(['第一段。\n\n  第二段。']);
  });

  it('不足 MIN_CHUNK（80 字）的短段落被丢弃，长段落保留', () => {
    const longPara = '甲'.repeat(200) + '。';
    const shortPara = '短。';
    const out = chunkDocument(`${longPara}\n\n${shortPara}`);
    expect(out).toHaveLength(1);
    expect(out[0]).toBe(longPara);
  });

  it('超长段落按标点滑动窗口切分，块长不超过 HARD_MAX', () => {
    // 每个分句 300 字，总长 903 字 > HARD_MAX(600) 才能触发切分
    const text = '这'.repeat(300) + '。' + '那'.repeat(300) + '。' + '哪'.repeat(300) + '。';
    const out = chunkDocument(text);
    expect(out.length).toBeGreaterThan(1);
    for (const piece of out) {
      expect(piece.length).toBeLessThanOrEqual(600);
      // 每块都是原文的连续子串（滑动窗口重叠可能导致首尾不全，但内容不虚构）
      expect(text.includes(piece)).toBe(true);
    }
    // 首、中、尾三个分句内容都被覆盖
    expect(out.some((p) => p.includes('这'.repeat(50)))).toBe(true);
    expect(out.some((p) => p.includes('那'.repeat(50)))).toBe(true);
    expect(out.some((p) => p.includes('哪'.repeat(50)))).toBe(true);
  });

  it('切分位置尽量落在句末标点之后', () => {
    // 300 个字符 + 句号分段，目标 400 字切分：第一刀应在句号后
    const text = '字'.repeat(300) + '。' + '字'.repeat(300) + '。';
    const out = chunkDocument(text);
    // 第一块应以句号结尾
    expect(out[0].endsWith('。')).toBe(true);
  });

  it('纯标点无空格的超长文本也能切出重叠块（step 至少为 1）', () => {
    const text = '啊'.repeat(1000);
    const out = chunkDocument(text);
    expect(out.length).toBeGreaterThan(1);
    // 每块不超过硬上限
    for (const piece of out) {
      expect(piece.length).toBeLessThanOrEqual(600);
    }
  });
});
