'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Mail, User, KeyRound, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/shared/ui/card';
import { TextInput } from '@/shared/ui/TextInput';
import { Button } from '@/shared/ui/Button';
import * as userApi from '@/shared/api/user';
import { useAuthStore } from '@/shared/stores/authStore';
import { clearLoginFlag } from '@/lib/auth/cookie';
import { showApiError } from '@/shared/lib/apiError';

export function ProfileTab() {
  const router = useRouter();
  const [userName, setUserName] = useState('');
  const [email, setEmail] = useState('');
  const [originalEmail, setOriginalEmail] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [emailCode, setEmailCode] = useState('');

  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);

  const [sendingEmailCode, setSendingEmailCode] = useState(false);
  const [emailPwdCode, setEmailPwdCode] = useState('');
  const [emailPwdNewPwd, setEmailPwdNewPwd] = useState('');
  const [sendingPwdCode, setSendingPwdCode] = useState(false);
  const [changingPwdByEmail, setChangingPwdByEmail] = useState(false);

  const [avatar, setAvatar] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deletePwd, setDeletePwd] = useState('');
  const [showDeletePwd, setShowDeletePwd] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    userApi.fetchProfile().then((p) => {
      setUserName(p.username || '');
      setEmail(p.email || '');
      setOriginalEmail(p.email || '');
      setAvatar(p.avatar);
    }).catch(() => {});
  }, []);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    try {
      const { avatar_url } = await userApi.uploadAvatar(file);
      setAvatar(avatar_url);
      toast.success('头像已更新');
    } catch {
      toast.error('头像上传失败');
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleSaveUsername = async () => {
    if (!userName.trim()) { toast.error('用户名不能为空'); return; }
    setSavingProfile(true);
    try {
      await userApi.updateProfile({ username: userName.trim(), email: originalEmail, code: emailCode || undefined });
      toast.success('已保存');
    } catch { toast.error('保存失败'); }
    finally { setSavingProfile(false); }
  };

  const handleSendEmailCode = async () => {
    const newEmail = email.trim();
    if (!newEmail) { toast.error('请输入新邮箱'); return; }
    if (newEmail === originalEmail) { toast.error('新邮箱不能与当前邮箱相同'); return; }
    setSendingEmailCode(true);
    try {
      await userApi.sendCode(newEmail);
      toast.success('验证码已发送到新邮箱');
    } catch { toast.error('发送失败'); }
    finally { setSendingEmailCode(false); }
  };

  const handleSaveEmail = async () => {
    if (email !== originalEmail && !emailCode) { toast.error('修改邮箱需输入验证码'); return; }
    setSavingProfile(true);
    try {
      await userApi.updateProfile({ username: userName.trim(), email: email.trim(), code: emailCode || undefined });
      setOriginalEmail(email);
      setEmailCode('');
      toast.success('已保存');
    } catch { toast.error('保存失败'); }
    finally { setSavingProfile(false); }
  };

  const handleChangePassword = async () => {
    if (!oldPwd || !newPwd) { toast.error('请输入旧密码和新密码'); return; }
    setChangingPwd(true);
    try {
      await userApi.changePassword(oldPwd, newPwd);
      toast.success('密码已修改');
      setOldPwd(''); setNewPwd('');
    } catch { toast.error('修改失败'); }
    finally { setChangingPwd(false); }
  };

  const handleSendPwdCode = async () => {
    setSendingPwdCode(true);
    try {
      await userApi.sendCode();
      toast.success('验证码已发送');
    } catch { toast.error('发送失败'); }
    finally { setSendingPwdCode(false); }
  };

  const handleChangePwdByEmail = async () => {
    if (!emailPwdCode || !emailPwdNewPwd) { toast.error('请输入验证码和新密码'); return; }
    setChangingPwdByEmail(true);
    try {
      await userApi.changePasswordByEmail(emailPwdCode, emailPwdNewPwd);
      toast.success('密码已修改');
      setEmailPwdCode(''); setEmailPwdNewPwd('');
    } catch { toast.error('修改失败'); }
    finally { setChangingPwdByEmail(false); }
  };

  const handleDeleteAccount = async () => {
    if (!deletePwd) { toast.error('请输入登录密码'); return; }
    setDeleting(true);
    try {
      await userApi.deleteAccount(deletePwd);
      // 注销成功：清除本地登录标志、内存会话与持久化用户信息，返回登录页
      clearLoginFlag();
      useAuthStore.persist.clearStorage();
      useAuthStore.setState({
        user: null,
        accessToken: null,
        refreshToken: null,
        isAuthenticated: false,
      });
      toast.success('账号已注销，数据已删除');
      router.push('/login');
    } catch (e) {
      showApiError(e, '注销失败');
      setDeleting(false);
    }
  };

  return (
    <>
    <div className="space-y-4">
      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-muted grid place-items-center text-base font-semibold text-foreground shrink-0 overflow-hidden">
            {avatar ? (
              <img src={avatar} alt="头像" className="w-full h-full object-cover" />
            ) : (
              (userName ? userName.charAt(0).toUpperCase() : 'U')
            )}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold truncate">{userName || '未登录'}</div>
            <div className="text-xs text-muted-foreground truncate">{email || '未绑定邮箱'}</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleAvatarChange}
          />
          <Button size="sm" variant="secondary" disabled={uploadingAvatar}
            onClick={() => fileInputRef.current?.click()}>
            {uploadingAvatar ? '上传中...' : '上传头像'}
          </Button>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <User size={14} strokeWidth={1.8} className="text-muted-foreground" />
          <div>
            <div className="text-xs font-medium">更换用户名</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">修改你的显示用户名</div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground block">用户名</label>
            <TextInput value={userName} onChange={(e) => setUserName(e.target.value)} />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleSaveUsername} disabled={savingProfile}>
              {savingProfile ? '保存中...' : '保存用户名'}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Mail size={14} strokeWidth={1.8} className="text-muted-foreground" />
          <div>
            <div className="text-xs font-medium">更换邮箱</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">修改绑定邮箱，需通过新邮箱验证码验证</div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground block">邮箱</label>
            <TextInput value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {email !== originalEmail && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Button size="sm" variant="secondary" onClick={handleSendEmailCode}
                  disabled={sendingEmailCode || savingProfile}
                  className="flex items-center gap-1">
                  <Mail size={10} /> {sendingEmailCode ? '发送中...' : '发送验证码'}
                </Button>
                <TextInput value={emailCode} onChange={(e) => setEmailCode(e.target.value)}
                  placeholder="验证码" maxLength={6} size="sm" className="w-32" />
                <Button size="sm" onClick={handleSaveEmail} disabled={savingProfile}>
                  {savingProfile ? '保存中...' : '保存邮箱'}
                </Button>
              </div>
              <span className="text-[10px] text-muted-foreground">验证码将发送至新邮箱，填写后保存完成修改</span>
            </div>
          )}
          {email === originalEmail && (
            <div className="flex justify-end">
              <Button onClick={handleSaveEmail} disabled={savingProfile}>
                {savingProfile ? '保存中...' : '保存邮箱'}
              </Button>
            </div>
          )}
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound size={14} strokeWidth={1.8} className="text-muted-foreground" />
          <div>
            <div className="text-xs font-medium">通过旧密码修改</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">已知当前密码时直接修改</div>
          </div>
        </div>
        <div className="space-y-3">
          {/* readOnly 初始状态阻止浏览器自动填充旧密码；聚焦时解除只读 */}
          <TextInput
            type={showOldPwd ? 'text' : 'password'}
            value={oldPwd}
            onChange={(e) => setOldPwd(e.target.value)}
            onFocus={(e) => { e.target.readOnly = false; }}
            readOnly placeholder="旧密码" autoComplete="new-password"
            suffix={(
              <button type="button" onClick={() => setShowOldPwd(!showOldPwd)} aria-label={showOldPwd ? '隐藏旧密码' : '显示旧密码'}
                className="bg-transparent border-none cursor-pointer text-muted-foreground">
                {showOldPwd ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            )}
          />
          <TextInput
            type={showNewPwd ? 'text' : 'password'}
            value={newPwd}
            onChange={(e) => setNewPwd(e.target.value)}
            placeholder="新密码" autoComplete="new-password"
            suffix={(
              <button type="button" onClick={() => setShowNewPwd(!showNewPwd)} aria-label={showNewPwd ? '隐藏新密码' : '显示新密码'}
                className="bg-transparent border-none cursor-pointer text-muted-foreground">
                {showNewPwd ? <EyeOff size={12} /> : <Eye size={12} />}
              </button>
            )}
          />
          <div className="flex justify-end">
            <Button variant="secondary" onClick={handleChangePassword} disabled={changingPwd}>
              {changingPwd ? '修改中...' : '通过旧密码修改'}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Mail size={14} strokeWidth={1.8} className="text-muted-foreground" />
          <div>
            <div className="text-xs font-medium">通过邮箱验证码修改</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">忘记密码时使用，验证码发送至绑定邮箱</div>
          </div>
        </div>
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={handleSendPwdCode} disabled={sendingPwdCode} className="flex items-center gap-1">
              <Mail size={10} /> {sendingPwdCode ? '发送中...' : '发送验证码'}
            </Button>
            <TextInput value={emailPwdCode} onChange={(e) => setEmailPwdCode(e.target.value)}
              placeholder="验证码" maxLength={6} size="sm" className="w-24" />
          </div>
          <TextInput type="password" value={emailPwdNewPwd} onChange={(e) => setEmailPwdNewPwd(e.target.value)}
            placeholder="新密码" autoComplete="new-password" />
          <div className="flex justify-end">
            <Button variant="secondary" onClick={handleChangePwdByEmail} disabled={changingPwdByEmail}>
              {changingPwdByEmail ? '修改中...' : '通过验证码修改'}
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-4 border-destructive/20">
        <div className="flex items-center gap-2">
          <AlertTriangle size={14} strokeWidth={1.8} className="text-destructive" />
          <div>
            <div className="text-xs font-medium text-destructive">注销账号</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">删除账号及全部数据（书籍、角色、工作流、知识库等），操作不可恢复</div>
          </div>
        </div>
        <div className="flex justify-end">
          <Button variant="danger" size="sm" onClick={() => setDeleteOpen(true)}>
            注销账号
          </Button>
        </div>
      </Card>
    </div>

    {deleteOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-foreground/[0.04]" onClick={() => setDeleteOpen(false)} />
        <div className="relative w-full max-w-md rounded-2xl border border-border/50 bg-card shadow-2xl modal-enter">
          <div className="flex items-center gap-2 px-5 h-12 border-b border-border/50">
            <AlertTriangle size={15} className="text-destructive" />
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">确认注销账号</h2>
          </div>
          <div className="p-5 space-y-4">
            <div className="text-xs text-muted-foreground leading-relaxed">
              注销后将永久删除你的账号及全部数据（书籍、角色设定、工作流、知识库文档、对话记录等），
              且<b>无法恢复</b>。请确认已通过导出功能备份重要作品。
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-muted-foreground">输入登录密码以确认</label>
              <TextInput
                type={showDeletePwd ? 'text' : 'password'}
                value={deletePwd}
                onChange={(e) => setDeletePwd(e.target.value)}
                onFocus={(e) => { e.target.readOnly = false; }}
                readOnly placeholder="登录密码" autoComplete="new-password"
                suffix={(
                  <button type="button" onClick={() => setShowDeletePwd(!showDeletePwd)} aria-label={showDeletePwd ? '隐藏密码' : '显示密码'}
                    className="bg-transparent border-none cursor-pointer text-muted-foreground">
                    {showDeletePwd ? <EyeOff size={12} /> : <Eye size={12} />}
                  </button>
                )}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 px-5 h-14 border-t border-border/50">
            <Button variant="ghost" size="sm" onClick={() => setDeleteOpen(false)} disabled={deleting}>取消</Button>
            <Button variant="danger" size="sm" onClick={handleDeleteAccount} disabled={deleting}>
              {deleting ? '注销中...' : '确认注销'}
            </Button>
          </div>
        </div>
      </div>
    )}
    </>
  );
}
