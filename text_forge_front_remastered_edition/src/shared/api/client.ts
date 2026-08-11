import axios from 'axios';
import { useAuthStore, waitForHydration } from '@/shared/stores/authStore';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';
const MODEL_PROXY_BASE = process.env.NEXT_PUBLIC_MODEL_PROXY_URL || `${API_BASE}/models/proxy`;

export { API_BASE, MODEL_PROXY_BASE };

/**
 * 4-2：统一错误封装（status / code / detail）。
 * 拦截器把 axios 错误归一化为 ApiError；上层可用 err.status 精确分支
 * （如 503 锁冲突、404 会话不存在、409 并发互斥）。
 *
 * 审查修复：保留 response 与 axios code（超时 ECONNABORTED / 网络 ETIMEDOUT），
 * 避免 parseApiError 等既有消费方读 err.response.data / err.code 时失效。
 */
export class ApiError extends Error {
  status?: number;
  code?: string;
  detail?: unknown;
  response?: { status?: number; data?: unknown };

  constructor(message: string, status?: number, code?: string, detail?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.detail = detail;
  }
}

function toApiError(err: Error & { response?: { status?: number; data?: { detail?: unknown; code?: string } }; code?: string }): ApiError {
  const status = err.response?.status;
  const data = err.response?.data;
  const detail = typeof data?.detail === 'string' ? data.detail : undefined;
  const api = new ApiError(detail || err.message, status, data?.code ?? err.code, data?.detail);
  // 保留原始 response，供 parseApiError（apiError.ts）等既有消费方继续读取
  api.response = err.response;
  return api;
}

/**
 * 2.5：从非 2xx 响应中提取后端具体错误原因（FastAPI detail 归一化）。
 * 支持三种形态：字符串、422 校验错误数组 [{loc,msg}]、对象 {message,...}（如注册冲突）。
 * 返回 null 表示无法解析（调用方回退笼统文案）。
 */
export async function extractApiDetail(res: Response): Promise<string | null> {
  if (!res) return null;
  try {
    const data = (await res.clone().json()) as { detail?: unknown };
    const detail = data?.detail;
    if (typeof detail === 'string' && detail) return detail;
    if (Array.isArray(detail)) {
      const parts = detail
        .filter((it) => it && typeof it === 'object')
        .map((it: { msg?: string; loc?: unknown[] }) => {
          const loc = Array.isArray(it.loc) ? it.loc.join('.') : '';
          return loc ? `${loc}: ${it.msg || ''}` : it.msg || '';
        })
        .filter(Boolean);
      if (parts.length > 0) return parts.join('；');
    }
    if (detail && typeof detail === 'object') {
      const inner = detail as Record<string, unknown>;
      if (typeof inner.message === 'string' && inner.message) return inner.message;
      if (typeof inner.msg === 'string' && inner.msg) return inner.msg;
    }
    return null;
  } catch {
    return null;
  }
}

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

apiClient.interceptors.request.use(async (config) => {
  await waitForHydration();
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise: Promise<boolean> | null = null;

async function waitForRefresh(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = useAuthStore.getState().refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }
  return refreshPromise;
}

apiClient.interceptors.response.use(
  (res) => res,
  async (err) => {
    const originalRequest = err.config;
    if (err.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const ok = await waitForRefresh();
      if (ok) {
        const newToken = useAuthStore.getState().accessToken;
        if (newToken) {
          // 保留原始请求头，仅刷新 Authorization
          const headers: Record<string, string> = { ...(originalRequest.headers || {}) };
          headers.Authorization = `Bearer ${newToken}`;
          // multipart 重试必须移除旧的 Content-Type（含旧 boundary）：
          // 重新序列化 FormData 时 axios 会生成新的 boundary，保留旧头会导致 400。
          if (originalRequest.data instanceof FormData) {
            delete headers['Content-Type'];
          }
          const retryConfig = {
            method: originalRequest.method,
            url: originalRequest.url,
            data: originalRequest.data,
            params: originalRequest.params,
            headers,
            _retry: true,
          };
          return apiClient.request(retryConfig);
        }
      }
      // 仅在未处于登录页时跳转，避免刷新循环；会话过期本就需重新登录
      if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
        window.location.href = '/login';
      }
    }
    // 2.5：拒绝前把后端具体 detail 归一化进 err.message（错误信息具体化约束），
    // 不破坏 401 刷新 / FormData 重试路径
    const detail: unknown = err.response?.data?.detail;
    if (typeof detail === 'string' && detail) {
      err.message = detail;
    } else if (detail && typeof detail === 'object') {
      // FastAPI 422 的 detail 是数组 [{loc, msg, type}]，拼出可读信息
      const items = (detail as Array<{ msg?: string; loc?: unknown[] }>).filter(
        (it) => it && typeof it === 'object',
      );
      if (items.length > 0) {
        err.message = items
          .map((it) => {
            const loc = Array.isArray(it.loc) ? it.loc.join('.') : '';
            return loc ? `${loc}: ${it.msg || ''}` : it.msg || '';
          })
          .join('；');
      }
    }
    // 4-2：归一化为 ApiError（status/code/detail），err.message 已包含具体原因
    return Promise.reject(toApiError(err));
  },
);
