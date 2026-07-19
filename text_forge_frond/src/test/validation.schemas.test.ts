import { describe, it, expect } from 'vitest';
import {
  emailSchema,
  passwordSchema,
  usernameSchema,
  createProjectSchema,
  createCharacterSchema,
  chatMessageSchema,
} from '@/lib/validation/schemas';

describe('11.1 单元测试 - 验证 schemas', () => {
  describe('emailSchema', () => {
    it('验证有效邮箱', () => {
      expect(emailSchema.parse('test@example.com')).toBe('test@example.com');
      expect(emailSchema.parse('user.name@domain.co')).toBe('user.name@domain.co');
    });

    it('拒绝无效邮箱', () => {
      expect(() => emailSchema.parse('invalid-email')).toThrow();
      expect(() => emailSchema.parse('missing@domain')).toThrow();
      expect(() => emailSchema.parse('@nodomain.com')).toThrow();
    });
  });

  describe('passwordSchema', () => {
    it('接受6位以上密码', () => {
      expect(passwordSchema.parse('123456')).toBe('123456');
      expect(passwordSchema.parse('password123')).toBe('password123');
    });

    it('拒绝短于6位的密码', () => {
      expect(() => passwordSchema.parse('12345')).toThrow('密码至少6位');
      expect(() => passwordSchema.parse('')).toThrow();
    });
  });

  describe('usernameSchema', () => {
    it('接受2-20位用户名', () => {
      expect(usernameSchema.parse('ab')).toBe('ab');
      expect(usernameSchema.parse('testuser')).toBe('testuser');
      expect(usernameSchema.parse('a'.repeat(20))).toBe('a'.repeat(20));
    });

    it('拒绝过短或过长的用户名', () => {
      expect(() => usernameSchema.parse('a')).toThrow('用户名至少2位');
      expect(() => usernameSchema.parse('a'.repeat(21))).toThrow('用户名最多20位');
    });
  });

  describe('createProjectSchema', () => {
    it('验证有效项目数据', () => {
      const result = createProjectSchema.parse({
        title: '测试项目',
        description: '项目描述',
        genre: '科幻',
      });
      expect(result.title).toBe('测试项目');
      expect(result.genre).toBe('科幻');
    });

    it('默认 genre 为 general', () => {
      const result = createProjectSchema.parse({ title: '新项目' });
      expect(result.genre).toBe('general');
    });

    it('拒绝空标题', () => {
      expect(() => createProjectSchema.parse({ title: '' })).toThrow('标题不能为空');
    });

    it('拒绝过长标题', () => {
      expect(() => createProjectSchema.parse({ title: 'a'.repeat(101) })).toThrow('标题过长');
    });
  });

  describe('createCharacterSchema', () => {
    it('验证有效角色数据', () => {
      const result = createCharacterSchema.parse({
        name: '角色名',
        description: '角色描述',
        projectId: 'proj123',
      });
      expect(result.name).toBe('角色名');
      expect(result.projectId).toBe('proj123');
    });

    it('允许可选字段为空', () => {
      const result = createCharacterSchema.parse({
        name: '角色',
        description: '描述',
        projectId: null,
        avatar: undefined,
      });
      expect(result.projectId).toBeNull();
    });

    it('拒绝空角色名', () => {
      expect(() => createCharacterSchema.parse({ name: '', description: 'desc' })).toThrow('角色名不能为空');
    });
  });

  describe('chatMessageSchema', () => {
    it('验证有效消息', () => {
      const result = chatMessageSchema.parse({
        message: '你好',
        project_id: 'proj123',
      });
      expect(result.message).toBe('你好');
    });

    it('拒绝空消息', () => {
      expect(() => chatMessageSchema.parse({ message: '' })).toThrow('消息不能为空');
    });

    it('拒绝过长消息', () => {
      expect(() => chatMessageSchema.parse({ message: 'a'.repeat(10001) })).toThrow('消息过长');
    });
  });
});