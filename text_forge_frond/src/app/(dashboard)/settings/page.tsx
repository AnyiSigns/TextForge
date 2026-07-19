// src/app/(dashboard)/settings/page.tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuthStore } from '@/lib/stores/authStore';
import { useSettingsStore, type BgArea } from '@/lib/stores/settingsStore';
import { useTheme } from 'next-themes';
import apiClient from '@/lib/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { ProcessNav } from '@/components/projects/ProcessNav';
import { PageHeader } from '@/components/shared/PageHeader';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { ModelsSettings } from '@/components/settings/ModelsSettings';
import { Moon, Sun, Monitor, Image as ImageIcon, Eye, EyeOff, User, Palette, Sparkles, Boxes, SlidersHorizontal, Download } from 'lucide-react';
import { EMBED_TIERS, isTierDownloaded, switchEmbedTier, downloadEmbedModel, getDownloadedTiers, initDownloadedTiers } from '@/lib/rag/embed';
import { toast } from 'sonner';
import { useProjectStore } from '@/lib/stores/projectStore';
import { useCharacterStore } from '@/lib/stores/characterStore';
import { useBriefStore } from '@/lib/stores/briefStore';
import { useModelStore } from '@/lib/stores/modelStore';
import { exportWorkspace, downloadBackup } from '@/lib/storage/backup';

const BG_AREA_OPTIONS: { value: BgArea; label: string }[] = [
  { value: 'global', label: '全部页面' },
  { value: 'dashboard', label: '仅仪表盘' },
  { value: 'projects', label: '项目管理' },
  { value: 'characters', label: '角色模拟' },
  { value: 'knowledge', label: '知识库' },
  { value: 'tasks', label: 'AI视频' },
  { value: 'assets', label: 'AI绘画' },
  { value: 'api-keys', label: '开放平台' },
  { value: 'settings', label: '设置页' },
];

const FONT_FAMILY_OPTIONS: { value: string; label: string }[] = [
  { value: 'system', label: '系统默认' },
  { value: 'sans', label: '无衬线（黑体）' },
  { value: 'serif', label: '衬线（宋体）' },
  { value: 'kai', label: '楷体' },
  { value: 'yuan', label: '圆体' },
  { value: 'fangsong', label: '仿宋' },
];

export default function SettingsPage() {
  const { user, updateUser } = useAuthStore();
  const {
    bgImage, bgOpacity, bgBlur, bgArea, suggestionFrequency,
    bgSolidOpacity, inkEnabled, inkOpacity, motionEnabled, glassEnabled,
    cardGlassOpacity, cardGlassBlur,
    contentScale, fontFamily,
    setBgImage, setBgOpacity, setBgBlur, setBgArea, setSuggestionFrequency,
    setBgSolidOpacity, setInkEnabled, setInkOpacity, setMotionEnabled, setGlassEnabled,
    setCardGlassOpacity, setCardGlassBlur, setSidebarGlassOpacity, setSidebarGlassBlur,
    setContentScale, setFontFamily,
    embedTierId, setEmbedTierId,
  } = useSettingsStore();
  const { theme, setTheme } = useTheme();

  const [activeTab, setActiveTab] = useState('profile');

  // 已下载的本地向量模型档位（与「模型 → 向量模型」同源，联动显示）
  const [downloadedTiers, setDownloadedTiers] = useState<string[]>([]);
  useEffect(() => {
    initDownloadedTiers().then(() => setDownloadedTiers(getDownloadedTiers()));
  }, []);
  const refreshDownloadedTiers = () => setDownloadedTiers(getDownloadedTiers());

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
      const { data } = await apiClient.put('/api/user/profile', { username, email });
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
        {/* Tab 1: 个人信息 */}
        {activeTab === 'profile' && (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>个人资料</CardTitle>
              <CardDescription>修改你的用户名和头像，用户 ID 不可更改</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <form onSubmit={handleUpdateProfile} className="space-y-4">
                <div className="space-y-1">
                  <Label className="text-muted-foreground">用户 ID</Label>
                  <Input value={user?.id || '未登录'} disabled className="bg-muted/50 cursor-not-allowed" />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="username">用户名</Label>
                  <Input
                    id="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="输入新用户名"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="email">邮箱</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="输入新邮箱"
                  />
                </div>

                <div className="space-y-2">
                  <Label>头像</Label>
                  <div className="flex items-center gap-4">
                    <Avatar className="w-20 h-20 border-2 border-border">
                      <AvatarImage src={user?.avatar} />
                      <AvatarFallback className="text-2xl">{user?.username?.slice(0, 2).toUpperCase() || 'U'}</AvatarFallback>
                    </Avatar>
                    <div>
                      <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isAvatarLoading}>
                        {isAvatarLoading ? '上传中...' : '更换头像'}
                      </Button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleAvatarUpload}
                      />
                    </div>
                  </div>
                </div>

                <Button type="submit" disabled={isLoading}>保存个人资料</Button>
              </form>

              <Separator />

              <form onSubmit={handleChangePassword} className="space-y-4">
                <div>
                  <CardTitle className="text-base">修改密码</CardTitle>
                  <CardDescription className="mt-1">选择旧密码验证或邮箱验证两种方式</CardDescription>
                </div>
                <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
                  <Button
                    type="button"
                    variant={passwordMode === 'old' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPasswordMode('old')}
                  >
                    🔑 旧密码验证
                  </Button>
                  <Button
                    type="button"
                    variant={passwordMode === 'email' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setPasswordMode('email')}
                  >
                    📧 邮箱验证
                  </Button>
                </div>

                {passwordMode === 'old' && (
                  <div className="space-y-2">
                    <Label htmlFor="oldPwd">当前密码</Label>
                    <div className="relative">
                      <Input
                        id="oldPwd"
                        type={showOldPwd ? 'text' : 'password'}
                        value={oldPassword}
                        onChange={(e) => setOldPassword(e.target.value)}
                        placeholder="输入当前密码"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="absolute right-1 top-1/2 -translate-y-1/2"
                        onClick={() => setShowOldPwd(!showOldPwd)}
                      >
                        {showOldPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </Button>
                    </div>
                  </div>
                )}

                {passwordMode === 'email' && (
                  <div className="space-y-2">
                    <Label htmlFor="emailCode">邮箱验证码</Label>
                    <div className="flex gap-2">
                      <Input
                        id="emailCode"
                        value={emailCode}
                        onChange={(e) => setEmailCode(e.target.value)}
                        placeholder="输入验证码"
                        className="flex-1"
                      />
                      <Button type="button" variant="outline" onClick={handleSendCode} disabled={isSendingCode}>
                        {isSendingCode ? '发送中...' : '发送验证码'}
                      </Button>
                    </div>
                  </div>
                )}

                <Separator />

                <div className="space-y-2">
                  <Label htmlFor="newPwd">新密码</Label>
                  <div className="relative">
                    <Input
                      id="newPwd"
                      type={showNewPwd ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="输入新密码（至少6位）"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="absolute right-1 top-1/2 -translate-y-1/2"
                      onClick={() => setShowNewPwd(!showNewPwd)}
                    >
                      {showNewPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPwd">确认新密码</Label>
                  <Input
                    id="confirmPwd"
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="再次输入新密码"
                  />
                </div>

                <Button type="submit" disabled={isLoading}>确认修改密码</Button>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Tab 2: 外观 */}
        {activeTab === 'appearance' && (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>主题与背景</CardTitle>
              <CardDescription>自定义界面风格，支持上传个人背景图片</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>主题模式</Label>
                <div className="flex gap-2">
                  <Button variant={theme === 'light' ? 'default' : 'outline'} onClick={() => setTheme('light')}>
                    <Sun className="w-4 h-4 mr-2" /> 亮色
                  </Button>
                  <Button variant={theme === 'dark' ? 'default' : 'outline'} onClick={() => setTheme('dark')}>
                    <Moon className="w-4 h-4 mr-2" /> 暗色
                  </Button>
                  <Button variant={theme === 'system' ? 'default' : 'outline'} onClick={() => setTheme('system')}>
                    <Monitor className="w-4 h-4 mr-2" /> 跟随系统
                  </Button>
                </div>
              </div>

              <Separator />

              <div className="space-y-4">
                <Label>自定义背景</Label>
                <div className="flex items-center gap-4">
                  <Button type="button" variant="outline" onClick={() => bgFileInputRef.current?.click()} disabled={isBgLoading}>
                    <ImageIcon className="w-4 h-4 mr-2" /> 上传背景图
                  </Button>
                  {bgImage && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => setBgImage(null)}>
                      移除背景
                    </Button>
                  )}
                  <input
                    ref={bgFileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleBgUpload}
                  />
                </div>

                {bgImage && (
                  <div className="grid grid-cols-2 gap-6 p-4 bg-muted/30 rounded-lg">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>透明度</span>
                        <span className="text-muted-foreground">{bgOpacity}%</span>
                      </div>
                      <input
                        type="range"
                        min="10" max="100" value={bgOpacity}
                        onChange={(e) => setBgOpacity(parseInt(e.target.value))}
                        className="w-full accent-primary"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>模糊度</span>
                        <span className="text-muted-foreground">{bgBlur}px</span>
                      </div>
                      <input
                        type="range"
                        min="0" max="20" value={bgBlur}
                        onChange={(e) => setBgBlur(parseInt(e.target.value))}
                        className="w-full accent-primary"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label>背景显示范围</Label>
                  <Select value={bgArea} onValueChange={(v) => setBgArea(v as BgArea)}>
                  <SelectTrigger className="max-w-xs">
                    <SelectValue placeholder="选择范围">
                      {(value: string) => BG_AREA_OPTIONS.find((o) => o.value === value)?.label ?? value}
                    </SelectValue>
                  </SelectTrigger>
                    <SelectContent>
                      {BG_AREA_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="grid grid-cols-2 gap-6 p-4 bg-muted/30 rounded-lg">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>实色层透明度</span>
                      <span className="text-muted-foreground">{bgSolidOpacity}%</span>
                    </div>
                    <input
                      type="range"
                      min="0" max="100" value={bgSolidOpacity}
                      onChange={(e) => setBgSolidOpacity(parseInt(e.target.value))}
                      className="w-full accent-primary"
                    />
                  </div>
                </div>
              </div>

              <Separator />

              {/* 全局开关：水墨纹理 / 动画 / 液态玻璃 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between rounded-lg border border-border/40 p-3">
                  <div className="space-y-0.5">
                    <Label className="text-sm">水墨纹理</Label>
                    <p className="text-xs text-muted-foreground">在背景上叠加水墨噪点与晕染质感</p>
                  </div>
                  <Switch checked={inkEnabled} onCheckedChange={setInkEnabled} />
                </div>
                {inkEnabled && (
                  <div className="grid grid-cols-2 gap-6 p-4 bg-muted/30 rounded-lg">
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>水墨强度</span>
                        <span className="text-muted-foreground">{inkOpacity}%</span>
                      </div>
                      <input
                        type="range"
                        min="0" max="100" value={inkOpacity}
                        onChange={(e) => setInkOpacity(parseInt(e.target.value))}
                        className="w-full accent-primary"
                      />
                    </div>
                  </div>
                )}
                <div className="flex items-center justify-between rounded-lg border border-border/40 p-3">
                  <div className="space-y-0.5">
                    <Label className="text-sm">动画效果</Label>
                    <p className="text-xs text-muted-foreground">关闭后禁用页面过渡与微动效</p>
                  </div>
                  <Switch checked={motionEnabled} onCheckedChange={setMotionEnabled} />
                </div>
                <div className="flex items-center justify-between rounded-lg border border-border/40 p-3">
                  <div className="space-y-0.5">
                    <Label className="text-sm">液态玻璃</Label>
                    <p className="text-xs text-muted-foreground">卡片与侧边栏启用毛玻璃质感</p>
                  </div>
                  <Switch checked={glassEnabled} onCheckedChange={setGlassEnabled} />
                </div>
              </div>

              {glassEnabled && (
                <div className="grid grid-cols-2 gap-6 p-4 bg-muted/30 rounded-lg">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>玻璃透明度</span>
                      <span className="text-muted-foreground">{cardGlassOpacity}%</span>
                    </div>
                    <input
                      type="range"
                      min="0" max="100" value={cardGlassOpacity}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        setCardGlassOpacity(v);
                        setSidebarGlassOpacity(v);
                      }}
                      className="w-full accent-primary"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>玻璃模糊度</span>
                      <span className="text-muted-foreground">{cardGlassBlur}px</span>
                    </div>
                    <input
                      type="range"
                      min="0" max="40" value={cardGlassBlur}
                      onChange={(e) => {
                        const v = parseInt(e.target.value);
                        setCardGlassBlur(v);
                        setSidebarGlassBlur(v);
                      }}
                      className="w-full accent-primary"
                    />
                  </div>
                </div>
              )}

              <Separator />

              <div className="space-y-2">
                <Label>界面字体</Label>
                <Select value={fontFamily} onValueChange={(v) => setFontFamily(v ?? 'system')}>
                  <SelectTrigger className="max-w-xs">
                    <SelectValue placeholder="选择字体">
                      {(value: string) => FONT_FAMILY_OPTIONS.find((o) => o.value === value)?.label ?? value}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {FONT_FAMILY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">切换界面整体字体（标题与正文同步生效）</p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <Label>页面展示大小</Label>
                  <span className="text-muted-foreground text-sm">{contentScale}%</span>
                </div>
                <input
                  type="range"
                  min="80" max="120" value={contentScale}
                  onChange={(e) => setContentScale(parseInt(e.target.value))}
                  className="w-full accent-primary"
                />
                <p className="text-xs text-muted-foreground">调小更紧凑，调大更舒展（影响整体字号与间距）</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tab 3: AI 偏好 */}
        {activeTab === 'ai' && (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>AI 联想设置</CardTitle>
              <CardDescription>控制写作时 AI 建议的触发频率与本地检索精度</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <Label>提示频率</Label>
                <Select
                  value={suggestionFrequency}
                  onValueChange={(value) => {
                    if (value === null) return;
                    setSuggestionFrequency(value as 'high' | 'medium' | 'manual');
                  }}
                >
                  <SelectTrigger className="w-full max-w-xs">
                    <SelectValue placeholder="选择频率">
                      {(value: string) => {
                        if (value === 'high') return '高频 (0.3秒)';
                        if (value === 'medium') return '均衡 (1.2秒)';
                        if (value === 'manual') return '手动 (Ctrl+Space)';
                        return value;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="high">高频 (0.3秒)</SelectItem>
                    <SelectItem value="medium">均衡 (1.2秒)</SelectItem>
                    <SelectItem value="manual">手动 (Ctrl+Space)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1">
                <Label>个人文档库检索</Label>
                <p className="text-xs text-muted-foreground">
                  个人文档存在你本机浏览器，用本机向量检索，不依赖任何外部服务、完全在本地完成。
                  首次使用会下载本地模型，之后离线可用。公共文档库由服务端检索。
                </p>
              </div>
              <div className="space-y-1">
                <Label>检索精度（向量维度）</Label>
                <Select
                  value={embedTierId}
                  onValueChange={(v) => {
                    if (v === embedTierId) return;
                    const id = v as string;
                    const t = EMBED_TIERS.find((x) => x.id === id);
                    if (!t) return;
                    // 已下载该精度：直接切换，不打扰用户（权重已在本机）
                    if (isTierDownloaded(id)) {
                      switchEmbedTier(id);
                      setEmbedTierId(id);
                      toast.success(`已切换到「${t.label}」`);
                      return;
                    }
                    // 未下载：提示并触发下载
                    const ok = window.confirm(
                      `「${t.label}」尚未下载到本机（约 ${t.sizeMB}MB）。\n\n` +
                      '确定现在下载吗？下载完成前该精度不可用，已下载的其它精度不受影响。'
                    );
                    if (!ok) return;
                    setEmbedTierId(id);
                    (async () => {
                      try {
                        const { resetForTier } = await import('@/lib/rag/vectorStore');
                        await resetForTier(id);
                        await downloadEmbedModel(id);
                        switchEmbedTier(id);
                        refreshDownloadedTiers();
                        toast.success(`已下载并切换到「${t.label}」，离线可用`);
                      } catch {
                        toast.error('下载失败，请重试或选择已下载的精度');
                      }
                    })();
                  }}
                >
                  <SelectTrigger className="max-w-xs">
                    <SelectValue placeholder="选择精度">
                      {(value: string) => {
                        const t = EMBED_TIERS.find((x) => x.id === value);
                        const dl = isTierDownloaded(value);
                        return t ? `${t.label} · ${t.desc}${dl ? '（已下载）' : ''}` : value;
                      }}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {EMBED_TIERS.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.label} · {t.desc}{downloadedTiers.includes(t.id) ? '（已下载）' : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">更高维度检索更准，但首次下载模型更大、更占内存。已下载的精度会保留在本机，可在「模型 → 向量模型」中删除。</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tab 4: 模型 */}
        {activeTab === 'models' && (
          <ModelsSettings />
        )}

        {/* Tab 5: 高级选项 */}
        {activeTab === 'advanced' && (
          <Card className="glass-card">
            <CardHeader>
              <CardTitle>高级选项</CardTitle>
              <CardDescription>数据备份与导入等高级功能</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between rounded-lg border border-border/40 p-4">
                <div className="space-y-0.5">
                  <Label className="text-sm">全部项目导出（JSON）</Label>
                  <p className="text-xs text-muted-foreground">导出所有项目、角色、设定与当前设置，便于备份或迁移</p>
                </div>
                <Button variant="outline" onClick={handleExportAllJson}>
                  <Download className="w-4 h-4 mr-2" /> 导出全部
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </ProcessNav>
    </div>
  );
}
