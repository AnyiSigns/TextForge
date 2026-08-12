import { apiClient } from './client';

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

export async function sendCode(): Promise<void> {
  await apiClient.post('/user/send-code', {});
}

export async function uploadAvatar(file: File): Promise<{ avatar_url: string }> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await apiClient.post<{ avatar_url: string }>('/user/avatar', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
