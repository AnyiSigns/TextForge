// src/lib/validation/responses.ts
// 关键端点的 zod 响应校验，防后端脏数据导致前端白屏（规范缺口4.3）。
// 与 openapi/seed-api.yaml 保持一致；schema 校验失败会上报 monitoring 并抛出。
import { z } from 'zod';
import { captureException } from '@/lib/monitoring';

const optionalStringArray = z.array(z.string()).nullable().optional();

export const projectSchema = z.object({
  id: z.string(),
  title: z.string(),
  status: z.enum(['draft', 'generating', 'completed', 'paused']),
  genre: z.string().optional(),
  description: z.string().optional(),
  pinned: z.boolean().optional(),
  workflowId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const projectListResponseSchema = z.object({
  projects: z.array(projectSchema),
});

export const projectResponseSchema = z.object({
  project: projectSchema,
  version: z.number().int().optional(),
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

export const characterRelationshipSchema = z.object({
  id: z.string(),
  targetId: z.string(),
  relation: z.string(),
});

export const characterSchema = z.object({
  id: z.string(),
  name: z.string(),
  avatar: z.string().optional(),
  aliases: optionalStringArray,
  description: z.string(),
  role: z.string().optional(),
  status: z.string().optional(),
  currentProfile: z.string().optional(),
  customRole: z.string().optional(),
  relationships: z.array(characterRelationshipSchema).nullable().optional(),
  projectId: z.string().nullable().optional(),
  images: z.array(z.string()).optional(),
  referenceImages: optionalStringArray,
  referenceImage: z.string().nullable().optional(),
  imageSeed: z.number().int().nullable().optional(),
  createdAt: z.string(),
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
