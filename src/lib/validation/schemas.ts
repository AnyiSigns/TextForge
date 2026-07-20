// src/lib/validation/schemas.ts
import { z } from 'zod';

export const emailSchema = z.string().email('请输入有效的邮箱地址');

export const passwordSchema = z.string().min(6, '密码至少6位');

export const usernameSchema = z.string().min(2, '用户名至少2位').max(20, '用户名最多20位');

export const createProjectSchema = z.object({
  title: z.string().min(1, '标题不能为空').max(100, '标题过长'),
  description: z.string().max(500, '描述过长').optional(),
  genre: z.string().default('general'),
});

export const createCharacterSchema = z.object({
  name: z.string().min(1, '角色名不能为空').max(50, '角色名过长'),
  description: z.string().min(1, '角色描述不能为空'),
  projectId: z.string().nullable().optional(),
  avatar: z.string().url('头像链接无效').optional(),
});

export const chatMessageSchema = z.object({
  message: z.string().min(1, '消息不能为空').max(10000, '消息过长'),
  project_id: z.string().optional(),
  brief: z.string().optional(),
  character_name: z.string().optional(),
  character_description: z.string().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type CreateCharacterInput = z.infer<typeof createCharacterSchema>;
export type ChatMessageInput = z.infer<typeof chatMessageSchema>;