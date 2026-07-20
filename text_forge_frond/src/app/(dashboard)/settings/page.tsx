// src/app/(dashboard)/settings/page.tsx
'use client';

import { useState, useRef } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { useAuthStore } from '@/lib/stores/authStore';
import { useSettingsStore } from '@/features/settings';
import { ProcessNav } from '@/features/projects';
import { PageHeader } from '@/components/shared/PageHeader';
import { ModelsSettings } from '@/features/settings';
import { SlidersHorizontal, User, Palette, Sparkles, Boxes } from 'lucide-react';
import { EMBED_TIERS, isTierDownloaded, downloadEmbedModel } from '@/lib/rag/embed';
import { toast } from 'sonner';
import { useProjectStore } from '@/features/projects';
import { useCharacterStore } from '@/features/characters';
import { useBriefStore } from '@/features/projects';
import { useModelStore } from '@/features/settings';
import type { ModelCategory } from '@/types';
import { exportWorkspace, downloadBackup } from '@/lib/storage/backup';
import { ProfileSection } from './sections/ProfileSection';
import { AppearanceSection } from './sections/AppearanceSection';
import { AiPrefSection } from './sections/AiPrefSection';
import { AdvancedSection } from './sections/AdvancedSection';

export default function SettingsPage() {
  const { user, updateUser } = useAuthStore();
  const {
    setBgImage, setEmbedTierId,
  } = useSettingsStore(useShallow((s) => ({
    setBgImage: s.setBgImage, setEmbedTierId: s.setEmbedTierId,
  })));
  const [activeTab, setActiveTab] = useState('profile');
  const [modelsInitialCategory, setModelsInitialCategory] = useState<ModelCategory>('llm');

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
  const [isBgLoading, setIsBgLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const bgFileInputRef = useRef<HTMLInputElement>(null);

  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      const { data } = await (await import('@/lib/api/client')).default.put('/api/user/profile', { username, email });
      if (data?.user) {
        updateUser(data.user);
      }
      toast.success('个人资料已更新');
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
      const apiClient = (await import('@/lib/api/client')).default;
      const endpoint = passwordMode === 'old'
        ? '/api/user/change-password'
        : '/api/user/change-password-by-email';

      const body = passwordMode === 'old'
        ? { old_password: oldPassword, new_password: newPassword }
        : { email_code: emailCode, new_password: newPassword };

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
      const apiClient = (await import('@/lib/api/client')).default;
      await apiClient.post('/api/auth/send-verify-code', { email: emailToSend });
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
      const apiClient = (await import('@/lib/api/client')).default;
      const formData = new FormData();
      formData.append('avatar', file);
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

  const handleBgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsBgLoading(true);
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setBgImage(ev.target.result as string);
          toast.success('背景已更新');
        }
        setIsBgLoading(false);
      };
      reader.onerror = () => {
        toast.error('背景上传失败');
        setIsBgLoading(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleExportAllJson = async () => {
    try {
      const projects = useProjectStore.getState().projects;
      const characters = useCharacterStore.getState().characters;
      const briefs = useBriefStore.getState().briefs;
      const models = useModelStore.getState().models;
      const settings = useSettingsStore.getState();
      const projectIds = Array.isArray(projects)
        ? projects.map((p: { id: string }) => p.id)
        : Object.keys(projects || {});
      const backup = await exportWorkspace(
        { projects, characters, briefs, models, settings },
        projectIds,
      );
      downloadBackup(backup);
      toast.success('已导出全部项目（JSON）');
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      toast.error('导出失败', { description: err.message });
    }
  };

  // 切换向量检索精度：已下载直接切换并重建索引；未下载则跳到「模型 → 向量模型」触发下载
  const handleSwitchEmbedTier = (id: string) => {
    const t = EMBED_TIERS.find((x) => x.id === id);
    if (!t) return;
    if (isTierDownloaded(id)) {
      (async () => {
        try {
          const { resetForTier } = await import('@/lib/rag/vectorStore');
          const removed = await resetForTier(id);
          setEmbedTierId(id);
          toast.success(
            removed > 0
              ? `已切换到「${t.label}」，原有 ${removed} 篇文档需重新建库（在「知识库」中一键重建）`
              : `已切换到「${t.label}」`
          );
        } catch {
          toast.error('切换失败，请重试');
        }
      })();
      return;
    }
    const ok = window.confirm(
      `「${t.label}」尚未下载到本机（约 ${t.sizeMB}MB）。\n\n` +
      '确定现在下载吗？下载完成后会自动切到该精度；你已有的文档需要在「知识库」中重新建库一次。'
    );
    if (!ok) return;
    setEmbedTierId(id);
    setActiveTab('models');
    setModelsInitialCategory('embedding');
    (async () => {
      try {
        const { resetForTier } = await import('@/lib/rag/vectorStore');
        await resetForTier(id);
        await downloadEmbedModel(id);
        toast.success(`「${t.label}」已下载并启用。请到「知识库」重新建库以检索旧文档`);
      } catch {
        toast.error('下载失败，请重试或选择已下载的精度');
      }
    })();
  };

  return (
    <div className="page-shell">
      <PageHeader icon={SlidersHorizontal} title="设置" description="管理个人资料、外观、AI 偏好与高级选项" />

      <ProcessNav
        tabs={[
          { value: 'profile', label: '个人信息', icon: User },
          { value: 'appearance', label: '外观', icon: Palette },
          { value: 'ai', label: 'AI 偏好', icon: Sparkles },
          { value: 'models', label: '模型', icon: Boxes },
          { value: 'advanced', label: '高级选项', icon: SlidersHorizontal },
        ]}
        value={activeTab}
        onValueChange={setActiveTab}
      >
        {activeTab === 'profile' && (
          <ProfileSection
            username={username}
            email={email}
            oldPassword={oldPassword}
            newPassword={newPassword}
            confirmPassword={confirmPassword}
            emailCode={emailCode}
            passwordMode={passwordMode}
            isLoading={isLoading}
            isAvatarLoading={isAvatarLoading}
            showOldPwd={showOldPwd}
            showNewPwd={showNewPwd}
            isSendingCode={isSendingCode}
            onUsername={setUsername}
            onEmail={setEmail}
            onOldPassword={setOldPassword}
            onNewPassword={setNewPassword}
            onConfirmPassword={setConfirmPassword}
            onEmailCode={setEmailCode}
            onPasswordMode={setPasswordMode}
            onShowOldPwd={setShowOldPwd}
            onShowNewPwd={setShowNewPwd}
            onUpdateProfile={handleUpdateProfile}
            onChangePassword={handleChangePassword}
            onSendCode={handleSendCode}
            onAvatarUpload={handleAvatarUpload}
            fileInputRef={fileInputRef}
          />
        )}

        {activeTab === 'appearance' && (
          <AppearanceSection
            isBgLoading={isBgLoading}
            onBgUpload={handleBgUpload}
            bgFileInputRef={bgFileInputRef}
          />
        )}

        {activeTab === 'ai' && (
          <AiPrefSection onSwitchEmbedTier={handleSwitchEmbedTier} />
        )}

        {activeTab === 'models' && (
          <ModelsSettings initialCategory={modelsInitialCategory} />
        )}

        {activeTab === 'advanced' && (
          <AdvancedSection onExportAllJson={handleExportAllJson} />
        )}
      </ProcessNav>
    </div>
  );
}
