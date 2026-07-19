// src/lib/utils/errorHandler.ts
import { toast } from 'sonner';

interface ApiError {
  status?: number;
  message?: string;
  code?: string;
}

export function handleApiError(error: unknown, defaultMessage = '操作失败'): ApiError | null {
  const err = error as ApiError;

  if (err?.status === 400) {
    toast.error('参数错误', { description: err.message || '请检查输入内容' });
    return err;
  }

  if (err?.status === 401) {
    toast.error('未认证', { description: '请重新登录' });
    setTimeout(() => window.location.href = '/login', 1000);
    return err;
  }

  if (err?.status === 403) {
    toast.error('无权访问', { description: '您没有权限进行此操作' });
    return err;
  }

  if (err?.status === 404) {
    toast.error('未找到', { description: err.message || '请求的资源不存在' });
    return err;
  }

  if (err?.status === 429) {
    toast.warning('请求频繁', { description: '请稍后再试' });
    return err;
  }

  if (err?.status && err.status >= 500) {
    toast.error('服务器错误', { description: '服务器开小差，请稍后再试' });
    return err;
  }

  toast.error('错误', { description: err?.message || defaultMessage });
  return err;
}