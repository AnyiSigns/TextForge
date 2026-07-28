// src/lib/aiTextTransform.test.ts
import { describe, it, expect } from 'vitest';
import { transformText, AI_ACTION_LABEL } from './aiTextTransform';

describe('aiTextTransform - AI 文本辅助纯变换', () => {
  it('expand 在原文后追加扩写占位', () => {
    expect(transformText('expand', '原文')).toBe('原文\n\n（扩写）原文');
  });

  it('rewrite 加改写前缀', () => {
    expect(transformText('rewrite', '原文')).toBe('（改写）原文');
  });

  it('summarize 超长截断、短文本原样', () => {
    const long = 'x'.repeat(200);
    const out = transformText('summarize', long);
    expect(out.endsWith('（缩写）')).toBe(true);
    expect(out.length).toBeLessThan(long.length);
    expect(transformText('summarize', '短')).toBe('短');
  });

  it('AI_ACTION_LABEL 映射一致', () => {
    expect(AI_ACTION_LABEL).toEqual({ expand: '扩写', rewrite: '改写', summarize: '缩写' });
  });
});
