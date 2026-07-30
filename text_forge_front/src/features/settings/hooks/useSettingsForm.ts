'use client';

import { useState, useRef } from 'react';
import { useAuthStore } from '@/lib/stores/authStore';
import { toast } from 'sonner';
import apiClient from '@/shared/lib/apiClient';

export function useSettingsForm() {
  const { user, updateUser } = useAuthStore();
  const [username, setUsername] = useState(user?.username || '');
  const [email, setEmail] = useState(user?.email || '');
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [emailCode, setEmailCode] = useState('');
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [passwordMode, setPasswordMode] = useState<'old' | 'email'>('old');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isAvatarLoading, setIsAvatarLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    const isEmailChanged = email !== user?.email;
    if (isEmailChanged && !emailCode) {
      toast.error('请先获取并输入验证码');
      return;
    }
    setIsLoading(true);
    try {
      const body = isEmailChanged
        ? { username, email, code: emailCode }
        : { username, email };
      const { data } = await apiClient.put('/api/user/profile', body);
      if (data?.user) {
        updateUser(data.user);
      }
      toast.success('个人资料已更新');
      if (isEmailChanged) {
        setEmailCode('');
      }
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      toast.error('更新失败', { description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      toast.error('密码不一致');
      return;
    }
    if (newPassword.length < 6) {
      toast.error('密码至少6位');
      return;
    }

    setIsLoading(true);
    try {
      const endpoint = passwordMode === 'old'
        ? '/api/user/change-password'
        : '/api/user/change-password-by-email';

      const body = passwordMode === 'old'
        ? { oldPassword: oldPassword, newPassword: newPassword }
        : { code: emailCode, newPassword: newPassword };

      await apiClient.post(endpoint, body);
      toast.success('密码已修改');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setEmailCode('');
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      toast.error('修改失败', { description: err.message });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendCode = async () => {
    const emailToSend = user?.email;
    if (!emailToSend) {
      toast.error('无法获取邮箱地址');
      return;
    }
    setIsSendingCode(true);
    try {
      await apiClient.post('/api/auth/resend-verify', { email: emailToSend });
      toast.success('验证码已发送到你的邮箱');
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      toast.error('发送失败', { description: err.message });
    } finally {
      setIsSendingCode(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsAvatarLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const { data } = await apiClient.post('/api/user/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      if (data?.avatar_url) {
        updateUser({ avatar: data.avatar_url });
      }
      toast.success('头像已更新');
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      toast.error('上传失败', { description: err.message });
    } finally {
      setIsAvatarLoading(false);
      e.target.value = '';
    }
  };

  const isEmailChanged = email !== user?.email;

  return {
    username, email, oldPassword, newPassword, confirmPassword, emailCode,
    passwordMode, isLoading, isAvatarLoading, showOldPwd, showNewPwd, isSendingCode,
    isEmailChanged,
    setUsername, setEmail, setOldPassword, setNewPassword, setConfirmPassword, setEmailCode,
    setPasswordMode, setShowOldPwd, setShowNewPwd,
    handleUpdateProfile, handleChangePassword, handleSendCode, handleAvatarUpload,
    fileInputRef,
  };
}
