import { apiClient } from './client';

export async function fetchProfile(): Promise<{ userName: string; email: string; avatar: string }> {
  const { data } = await apiClient.get('/user/profile');
  return data;
}

export async function updateProfile(patch: { userName?: string; email?: string; code?: string }): Promise<void> {
  await apiClient.put('/user/profile', patch);
}

export async function changePassword(oldPassword: string, newPassword: string): Promise<void> {
  await apiClient.post('/user/change-password', { oldPassword, newPassword });
}

export async function changePasswordByEmail(code: string, newPassword: string): Promise<void> {
  await apiClient.post('/user/change-password-by-email', { code, newPassword });
}

export async function sendCode(): Promise<void> {
  await apiClient.post('/user/send-code');
}
