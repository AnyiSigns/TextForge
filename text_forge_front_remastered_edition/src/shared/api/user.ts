import { apiClient } from './client';
import { useAuthStore } from '@/shared/stores/authStore';

export async function fetchProfile(): Promise<{ username: string; email: string; avatar: string | null }> {
  const { data } = await apiClient.get<{ user: { username: string; email: string; avatar: string | null } }>('/user/profile');
  return data.user;
}

export async function updateProfile(patch: { username?: string; email?: string; code?: string }): Promise<void> {
  await apiClient.put('/user/profile', patch);
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  await apiClient.post('/user/change-password', { oldPassword, newPassword });
}

export async function changePasswordByEmail(code: string, newPassword: string): Promise<void> {
  await apiClient.post('/user/change-password-by-email', { code, newPassword });
}

export async function sendCode(email?: string): Promise<void> {
  // 不传 email 时发送当前绑定邮箱验证码（如邮箱改密）；
  // 传 email（新邮箱）时后端按新邮箱存储 change_email 验证码。
  await apiClient.post('/user/send-code', email ? { email } : {});
}

export async function uploadAvatar(file: File): Promise<{ avatar_url: string }> {
  const form = new FormData();
  form.append('file', file);
  // 不显式设置 Content-Type：axios 对 FormData 会自动生成带 boundary 的 multipart 头，
  // 手动覆盖会丢失 boundary 导致后端解析失败。
  const { data } = await apiClient.post<{ avatar_url: string }>('/user/avatar', form);
  return data;
}

export async function deleteAccount(password: string): Promise<void> {
  // access_token 传 body 供注销后立即加入黑名单（与 /auth/logout 语义一致，
  // 防止已删除账号的旧 token 继续通过 get_current 校验）
  const at = useAuthStore.getState().accessToken;
  await apiClient.delete('/user/account', { data: { password, access_token: at ?? null } });
}
