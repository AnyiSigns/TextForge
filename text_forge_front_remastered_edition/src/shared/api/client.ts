import axios from 'axios';
import { useAuthStore } from '@/shared/stores/authStore';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || '/api';
const MODEL_PROXY_BASE = process.env.NEXT_PUBLIC_MODEL_PROXY_URL || `${API_BASE}/models/proxy`;

export { API_BASE, MODEL_PROXY_BASE };

export const apiClient = axios.create({
  baseURL: API_BASE,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

apiClient.interceptors.request.use((config) => {
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
          const retryConfig = {
            method: originalRequest.method,
            url: originalRequest.url,
            data: originalRequest.data,
            params: originalRequest.params,
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${newToken}`,
            },
            _retry: true,
          };
          return apiClient.request(retryConfig);
        }
      }
      if (typeof window !== 'undefined') window.location.href = '/login';
    }
    return Promise.reject(err);
  },
);
