// src/shared/lib/api.ts
// 统一客户端封装：基于 apiClient（axios），对响应做 zod 安全解析（防脏数据白屏）。
// 调用处应传入对应 schema，解析失败时上报 monitoring 并抛出。
// 与 src/lib/validation/responses.ts 的 safeParse 配合，对齐 openapi/seed-api.yaml 契约。
import apiClient, { ApiError } from '@/shared/lib/apiClient';
import { API_URL } from '@/shared/config/env';
import { safeParse } from '@/lib/validation/responses';
import type { z } from 'zod';
import type { AxiosRequestConfig } from 'axios';

// dev 期（NEXT_PUBLIC_API_URL 为空串，走 mock）注入标识头，便于后端识别。
function mockHeader(): Record<string, string> {
  return API_URL ? {} : { 'X-Mock-Mode': '1' };
}

export async function apiGet<T>(
  url: string,
  schema: z.ZodType<T>,
  label: string,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await apiClient.get(url, { ...config, headers: { ...mockHeader(), ...config?.headers } });
  return safeParse(schema, data, label);
}

export async function apiPost<T>(
  url: string,
  schema: z.ZodType<T>,
  label: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await apiClient.post(url, body, {
    ...config,
    headers: { ...mockHeader(), ...config?.headers },
  });
  return safeParse(schema, data, label);
}

export async function apiPut<T>(
  url: string,
  schema: z.ZodType<T>,
  label: string,
  body?: unknown,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await apiClient.put(url, body, {
    ...config,
    headers: { ...mockHeader(), ...config?.headers },
  });
  return safeParse(schema, data, label);
}

export async function apiDelete<T>(
  url: string,
  schema: z.ZodType<T>,
  label: string,
  config?: AxiosRequestConfig,
): Promise<T> {
  const { data } = await apiClient.delete(url, {
    ...config,
    headers: { ...mockHeader(), ...config?.headers },
  });
  return safeParse(schema, data, label);
}

export { ApiError };
