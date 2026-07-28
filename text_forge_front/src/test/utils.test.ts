import { describe, it, expect } from 'vitest';
import { cn } from '@/lib/utils';

describe('11.1 单元测试 - 工具函数', () => {
  describe('cn 函数', () => {
    it('合并多个 className', () => {
      expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('处理条件 className', () => {
      expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz');
      expect(cn('foo', true && 'bar', 'baz')).toBe('foo bar baz');
    });

    it('合并 Tailwind 类（去重）', () => {
      expect(cn('px-2 py-2', 'py-4')).toBe('px-2 py-4');
      expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500');
    });

    it('处理 undefined 和 null', () => {
      expect(cn('foo', undefined, 'bar')).toBe('foo bar');
      expect(cn(null, 'bar', false)).toBe('bar');
    });

    it('返回空字符串当无输入', () => {
      expect(cn()).toBe('');
    });
  });
});