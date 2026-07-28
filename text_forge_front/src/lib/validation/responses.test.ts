// src/lib/validation/responses.test.ts
import { describe, it, expect, vi } from 'vitest';
import {
  bookListResponseSchema,
  characterSchema,
  charactersResponseSchema,
  safeParse,
} from '@/lib/validation/responses';

vi.mock('@/lib/monitoring', () => ({
  captureException: vi.fn(),
}));

describe('validation/responses - 项目响应', () => {
  it('合法 BookListResponse 解析通过', () => {
    const data = {
      books: [{ id: 1, title: 't', createdAt: '2026', updatedAt: '2026' }],
    };
    const out = bookListResponseSchema.parse(data);
    expect(out.books[0].id).toBe(1);
  });

  it('缺 status 字段时解析失败', () => {
    const data = { books: [{ id: 1, title: 't', createdAt: '2026', updatedAt: '2026' }] };
    expect(() => bookListResponseSchema.parse(data)).toThrow();
  });

  it('status 非法枚举时解析失败', () => {
    const data = {
      books: [{ id: 1, title: 't', status: 'weird', createdAt: '2026', updatedAt: '2026' }],
    };
    expect(() => bookListResponseSchema.parse(data)).toThrow();
  });
});

describe('validation/responses - 角色响应', () => {
  it('完整 Character 解析通过', () => {
    const data = {
      id: 1,
      name: '林',
      description: '主角',
      createdAt: '2026',
      updatedAt: '2026',
      relationshipChain: [{ id: 'r1', target: 'c2', relation: '宿敌' }],
      imageSeed: 'seed123',
      aliases: ['林公子'],
    };
    const out = characterSchema.parse(data);
    expect(out.relationshipChain?.[0].relation).toBe('宿敌');
    expect(out.imageSeed).toBe('seed123');
  });

  it('aliases 为 null 也能通过（nullable）', () => {
    const data = { id: 'c1', name: '林', description: 'd', createdAt: '2026', aliases: null };
    expect(() => characterSchema.parse(data)).not.toThrow();
  });

  it('charactersResponse 包一层', () => {
    const data = { characters: [{ id: 'c1', name: '林', description: 'd', createdAt: '2026' }] };
    const out = charactersResponseSchema.parse(data);
    expect(out.characters.length).toBe(1);
  });
});

describe('validation/responses - safeParse 失败上报', () => {
  it('解析失败调用 captureException 并抛错', async () => {
    const { captureException } = await import('@/lib/monitoring');
    expect(() => safeParse(characterSchema, { id: 'x' }, '角色')).toThrow('响应校验失败: 角色');
    expect(captureException).toHaveBeenCalled();
  });

  it('解析成功返回数据', () => {
    const data = { id: 'c1', name: '林', description: 'd', createdAt: '2026' };
    expect(safeParse(characterSchema, data, '角色')).toMatchObject({ id: 'c1' });
  });
});
