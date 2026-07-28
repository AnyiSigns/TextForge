// src/lib/validation/responses.ts
// 关键端点的 zod 响应校验，防后端脏数据导致前端白屏。
import { z } from 'zod';
import { captureException } from '@/lib/monitoring';

const optionalStringArray = z.array(z.string()).nullable().optional();

export const bookSchema = z.object({
  id: z.number(),
  title: z.string(),
  genre: z.string().optional(),
  description: z.string().optional(),
  pinned: z.boolean().optional(),
  workflowId: z.string().optional(),
  totalWordGoal: z.number().optional(),
  currentWordCount: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const bookListResponseSchema = z.object({
  books: z.array(bookSchema),
});

export const bookResponseSchema = z.object({
  book: bookSchema,
});

export const stepSchema = z.object({
  id: z.string(),
  agent: z.string(),
  agentName: z.string().optional(),
  content: z.string(),
  status: z.string(),
  nodeId: z.string().optional(),
});

export const stepsResponseSchema = z.object({
  steps: z.array(stepSchema),
});

export const characterRelationSchema = z.object({
  target: z.string(),
  relation: z.string(),
});

export const characterSchema = z.object({
  id: z.number(),
  name: z.string(),
  avatarUrl: z.string().optional(),
  aliases: optionalStringArray,
  description: z.string(),
  roleType: z.string().optional(),
  status: z.string().optional(),
  relationshipChain: z.array(characterRelationSchema).nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const charactersResponseSchema = z.object({
  characters: z.array(characterSchema),
});

export const characterResponseSchema = z.object({
  character: characterSchema,
});

export const avatarResponseSchema = z.object({
  avatar_url: z.string().optional(),
  url: z.string().optional(),
  avatar: z.string().optional(),
});

export const messageSchema = z.object({
  id: z.string(),
  role: z.enum(['user', 'assistant']),
  content: z.string(),
});

export const messagesResponseSchema = z.object({
  messages: z.array(messageSchema),
});

export const workflowSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().optional(),
});

export const workflowsResponseSchema = z.object({
  workflows: z.array(workflowSummarySchema),
});

export function safeParse<T>(schema: z.ZodType<T> | undefined, data: unknown, label: string): T {
  if (!schema) return data as T;
  const result = schema.safeParse(data);
  if (!result.success) {
    captureException(new Error(`响应校验失败: ${label}`), {
      extra: { issues: result.error.issues },
    });
    throw new Error(`响应校验失败: ${label}`);
  }
  return result.data;
}
