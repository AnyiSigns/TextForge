// src/lib/api/client.ts
import axios, { type AxiosRequestConfig } from 'axios';
import axiosRetry from 'axios-retry';
import { useAuthStore } from '@/lib/stores/authStore';
import type { SyncResponse } from '@/types';
import { API_URL } from '@/lib/config/env';
import { type ErrorCode } from './errorCodes';

const DEFAULT_TIMEOUT = 30000;

let sessionExpiredNotified = false;

// 会话失效统一处理：避免并发 401 重复弹 toast / 重复跳转
function notifySessionExpired() {
  if (sessionExpiredNotified) return;
  sessionExpiredNotified = true;
  if (typeof window !== 'undefined') {
    import('sonner').then(({ toast }) => {
      toast.error('登录已过期', { description: '请重新登录以继续使用', duration: 4000 });
    });
    useAuthStore.getState().logout();
    setTimeout(() => {
      window.location.href = '/login';
    }, 800);
  }
}

type RetryableRequestConfig = AxiosRequestConfig & { _retry?: boolean };

interface VersionedRequestConfig extends AxiosRequestConfig {
  meta?: { version?: number };
}

export interface SyncUpdate {
  id: string;
  [key: string]: unknown;
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
    public code?: ErrorCode,
    public data?: unknown
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const apiClient = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  timeout: DEFAULT_TIMEOUT,
  headers: { 'Content-Type': 'application/json' },
});

axiosRetry(apiClient, {
  retries: 3,
  retryDelay: axiosRetry.exponentialDelay,
  retryCondition: (error) => {
    // 自定义 401 刷新重试已单独处理，避免与 axios-retry 叠加导致幂等写请求发两次。
    if ((error.config as RetryableRequestConfig & { _noRetry?: boolean })?._noRetry) return false;
    const status = error.response?.status;
    return axiosRetry.isNetworkOrIdempotentRequestError(error) || status === 429 || (status !== undefined && status >= 500);
  },
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config as RetryableRequestConfig & { _noRetry?: boolean };
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        await refreshAccessToken();
        const newToken = useAuthStore.getState().accessToken;
        if (newToken) {
          originalRequest.headers = originalRequest.headers || {};
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          // 用原请求本身（已含拦截器生成的 Idempotency-Key / If-Match）重放，
          // 并标记 _noRetry 让 axios-retry 跳过，避免与自定义 401 重试叠加发两次。
          originalRequest._noRetry = true;
          return apiClient(originalRequest);
        }
      } catch {
        notifySessionExpired();
        return Promise.reject(error);
      }
    }
    return Promise.reject(error);
  }
);

export function generateIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `idem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const IDEMPOTENT_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'] as const;

apiClient.interceptors.request.use((config) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  const vc = config as VersionedRequestConfig;
  if (vc.meta?.version !== undefined) {
    config.headers = config.headers || {};
    config.headers['If-Match'] = String(vc.meta.version);
  }
  if (config.method && IDEMPOTENT_METHODS.includes(config.method.toUpperCase() as typeof IDEMPOTENT_METHODS[number])) {
    config.headers = config.headers || {};
    config.headers['Idempotency-Key'] = generateIdempotencyKey();
  }
  return config;
});

export async function getSyncUpdates(storeName: string, since: string): Promise<SyncResponse> {
  const response = await apiClient.get('/api/sync', { params: { since, store: storeName } });
  const data = response.data;
  return { updates: data?.updates || [], version: data?.version };
}

let refreshPromise: Promise<void> | null = null;

async function refreshAccessToken(): Promise<void> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = axios.post(`${API_URL}/api/auth/refresh`, {}, { withCredentials: true })
    .then((res) => {
      const newToken = res.data.access_token;
      useAuthStore.getState().setAccessToken(newToken);
    })
    .catch(() => {
      return Promise.reject();
    })
    .finally(() => {
      refreshPromise = null;
    });
  return refreshPromise;
}

export default apiClient;