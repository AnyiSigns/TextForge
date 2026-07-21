// src/app/(dashboard)/settings/sections/ProfileSection.tsx
'use client';

import { useAuthStore } from '@/lib/stores/authStore';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Eye, EyeOff, KeyRound, Mail } from 'lucide-react';

interface ProfileSectionProps {
  username: string;
  email: string;
  oldPassword: string;
  newPassword: string;
  confirmPassword: string;
  emailCode: string;
  passwordMode: 'old' | 'email';
  isLoading: boolean;
  isAvatarLoading: boolean;
  showOldPwd: boolean;
  showNewPwd: boolean;
  isSendingCode: boolean;
  isEmailChanged: boolean;
  onUsername: (v: string) => void;
  onEmail: (v: string) => void;
  onOldPassword: (v: string) => void;
  onNewPassword: (v: string) => void;
  onConfirmPassword: (v: string) => void;
  onEmailCode: (v: string) => void;
  onPasswordMode: (m: 'old' | 'email') => void;
  onShowOldPwd: (v: boolean) => void;
  onShowNewPwd: (v: boolean) => void;
  onUpdateProfile: (e: React.FormEvent) => void;
  onChangePassword: (e: React.FormEvent) => void;
  onSendCode: () => void;
  onAvatarUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
}

export function ProfileSection(props: ProfileSectionProps) {
  const { user } = useAuthStore();
  const {
    username, email, oldPassword, newPassword, confirmPassword, emailCode,
    passwordMode, isLoading, isAvatarLoading, showOldPwd, showNewPwd, isSendingCode,
    isEmailChanged,
    onUsername, onEmail, onOldPassword, onNewPassword, onConfirmPassword, onEmailCode,
    onPasswordMode, onShowOldPwd, onShowNewPwd,
    onUpdateProfile, onChangePassword, onSendCode, onAvatarUpload, fileInputRef,
  } = props;

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>个人资料</CardTitle>
        <CardDescription>修改你的用户名和头像，用户 ID 不可更改</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <form onSubmit={onUpdateProfile} className="space-y-4">
          <div className="space-y-1">
            <Label className="text-muted-foreground">用户 ID</Label>
            <Input value={user?.id || '未登录'} disabled className="bg-muted/50 cursor-not-allowed" />
          </div>

          <div className="space-y-1">
            <Label htmlFor="username">用户名</Label>
            <Input
              id="username"
              value={username}
              onChange={(e) => onUsername(e.target.value)}
              placeholder="输入新用户名"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => onEmail(e.target.value)}
              placeholder="输入新邮箱"
            />
            {isEmailChanged && (
              <div className="mt-2 p-3 bg-muted/30 rounded-md space-y-2">
                <p className="text-sm text-muted-foreground">
                  更改邮箱前，请先验证当前邮箱 {user?.email}
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={onSendCode}
                    disabled={isSendingCode}
                  >
                    {isSendingCode ? '发送中...' : '发送验证码'}
                  </Button>
                  <Input
                    placeholder="输入验证码"
                    value={emailCode}
                    onChange={(e) => onEmailCode(e.target.value)}
                    className="max-w-[120px]"
                  />
                </div>
              </div>
            )}
            <div className="flex justify-end">
              <Button type="submit" disabled={isLoading}>保存个人资料</Button>
            </div>
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
                  onChange={onAvatarUpload}
                />
              </div>
            </div>
          </div>
        </form>

        <Separator />

        <form onSubmit={onChangePassword} className="space-y-4">
          <div>
            <CardTitle className="text-base">修改密码</CardTitle>
            <CardDescription className="mt-1">选择旧密码验证或邮箱验证两种方式</CardDescription>
          </div>
          <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
            <Button
              type="button"
              variant={passwordMode === 'old' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onPasswordMode('old')}
            >
              <KeyRound className="w-4 h-4 mr-1.5" /> 旧密码验证
            </Button>
            <Button
              type="button"
              variant={passwordMode === 'email' ? 'default' : 'outline'}
              size="sm"
              onClick={() => onPasswordMode('email')}
            >
              <Mail className="w-4 h-4 mr-1.5" /> 邮箱验证
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
                  onChange={(e) => onOldPassword(e.target.value)}
                  placeholder="输入当前密码"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  onClick={() => onShowOldPwd(!showOldPwd)}
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
                  onChange={(e) => onEmailCode(e.target.value)}
                  placeholder="输入验证码"
                  className="flex-1"
                />
                <Button type="button" variant="outline" onClick={onSendCode} disabled={isSendingCode}>
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
                onChange={(e) => onNewPassword(e.target.value)}
                placeholder="输入新密码（至少6位）"
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-1 top-1/2 -translate-y-1/2"
                onClick={() => onShowNewPwd(!showNewPwd)}
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
              onChange={(e) => onConfirmPassword(e.target.value)}
              placeholder="再次输入新密码"
            />
          </div>

          <Button type="submit" disabled={isLoading}>确认修改密码</Button>
        </form>
      </CardContent>
    </Card>
  );
}
