'use client';

import { useEffect, useState } from 'react';
import { Settings as SettingsIcon, User, Palette, Eye, EyeOff, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from 'next-themes';
import { Card } from '@/shared/ui/card';
import { cn } from '@/shared/lib/cn';
import * as userApi from '@/shared/api/user';

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const [userName, setUserName] = useState('');
  const [email, setEmail] = useState('');
  const [originalEmail, setOriginalEmail] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);

  const [emailCode, setEmailCode] = useState('');
  const [sendingEmailCode, setSendingEmailCode] = useState(false);

  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [changingPwd, setChangingPwd] = useState(false);
  const [showOldPwd, setShowOldPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);

  const [emailPwdCode, setEmailPwdCode] = useState('');
  const [emailPwdNewPwd, setEmailPwdNewPwd] = useState('');
  const [sendingPwdCode, setSendingPwdCode] = useState(false);
  const [changingPwdByEmail, setChangingPwdByEmail] = useState(false);

  useEffect(() => {
    userApi.fetchProfile().then((p) => {
      setUserName(p.userName || '');
      setEmail(p.email || '');
      setOriginalEmail(p.email || '');
    }).catch(() => {});
  }, []);

  const handleSendEmailCode = async () => {
    setSendingEmailCode(true);
    try {
      await userApi.sendCode();
      toast.success('验证码已发送至原邮箱');
    } catch { toast.error('发送失败'); }
    finally { setSendingEmailCode(false); }
  };

  const handleSaveProfile = async () => {
    if (!userName.trim()) { toast.error('用户名不能为空'); return; }
    if (email !== originalEmail && !emailCode) { toast.error('修改邮箱需输入验证码，请先点击发送验证码'); return; }
    setSavingProfile(true);
    try {
      await userApi.updateProfile({ userName: userName.trim(), email: email.trim(), code: emailCode || undefined });
      setOriginalEmail(email);
      setEmailCode('');
      toast.success('已保存');
    } catch { toast.error('保存失败，验证码是否正确？'); }
    finally { setSavingProfile(false); }
  };

  const handleChangePassword = async () => {
    if (!oldPwd || !newPwd) { toast.error('请输入旧密码和新密码'); return; }
    setChangingPwd(true);
    try {
      await userApi.changePassword(oldPwd, newPwd);
      toast.success('密码已修改');
      setOldPwd(''); setNewPwd('');
    } catch { toast.error('修改失败，请检查旧密码'); }
    finally { setChangingPwd(false); }
  };

  const handleSendPwdCode = async () => {
    setSendingPwdCode(true);
    try {
      await userApi.sendCode();
      toast.success('验证码已发送至注册邮箱');
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
    } catch { toast.error('修改失败，验证码是否正确？'); }
    finally { setChangingPwdByEmail(false); }
  };

  return (
    <div className="h-full overflow-y-auto p-6 max-w-2xl">
      <div className="flex items-center gap-3 mb-6">
        <SettingsIcon size={22} className="text-muted-foreground" />
        <div>
          <h1 className="text-lg font-semibold">设置</h1>
          <p className="text-xs text-muted-foreground">管理账户、外观和偏好</p>
        </div>
      </div>

      <div className="space-y-6">
        <section>
          <div className="flex items-center gap-2 mb-3">
            <User size={14} className="text-muted-foreground" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">个人资料</span>
          </div>
          <Card className="p-4 space-y-3">
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">用户名</label>
              <input value={userName} onChange={(e) => setUserName(e.target.value)}
                className="w-full h-8 px-2 rounded-md text-xs bg-background border border-border focus:outline-none" />
            </div>
            <div>
              <label className="text-[11px] text-muted-foreground block mb-1">邮箱</label>
              <input value={email} onChange={(e) => setEmail(e.target.value)}
                className="w-full h-8 px-2 rounded-md text-xs bg-background border border-border focus:outline-none mb-1" />
              {email !== originalEmail && (
                <div className="flex items-center gap-2">
                  <button onClick={handleSendEmailCode} disabled={sendingEmailCode}
                    className="flex items-center gap-1 h-7 px-2 rounded-md text-[11px] border border-border cursor-pointer bg-transparent hover:bg-muted disabled:opacity-50">
                    <Mail size={10} /> {sendingEmailCode ? '发送中...' : '发送验证码'}
                  </button>
                  <input value={emailCode} onChange={(e) => setEmailCode(e.target.value)}
                    placeholder="输入验证码" maxLength={6}
                    className="w-24 h-7 px-2 rounded-md text-[11px] bg-background border border-border focus:outline-none" />
                  <span className="text-[10px] text-muted-foreground">验证码将发往原邮箱</span>
                </div>
              )}
            </div>
            <button onClick={handleSaveProfile} disabled={savingProfile}
              className="h-8 px-4 rounded-md bg-foreground text-background text-xs font-medium border-none cursor-pointer hover:opacity-90 disabled:opacity-50">
              {savingProfile ? '保存中...' : '保存'}
            </button>

            <div className="pt-3 border-t border-border space-y-2">
              <label className="text-[11px] text-muted-foreground block">通过旧密码修改</label>
              <div className="relative">
                <input type={showOldPwd ? 'text' : 'password'} value={oldPwd} onChange={(e) => setOldPwd(e.target.value)}
                  placeholder="旧密码" className="w-full h-8 pl-2 pr-8 rounded-md text-xs bg-background border border-border focus:outline-none" />
                <button onClick={() => setShowOldPwd(!showOldPwd)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-muted-foreground">
                  {showOldPwd ? <EyeOff size={12} /> : <Eye size={12} />}</button>
              </div>
              <div className="relative">
                <input type={showNewPwd ? 'text' : 'password'} value={newPwd} onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="新密码" className="w-full h-8 pl-2 pr-8 rounded-md text-xs bg-background border border-border focus:outline-none" />
                <button onClick={() => setShowNewPwd(!showNewPwd)} className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-none cursor-pointer text-muted-foreground">
                  {showNewPwd ? <EyeOff size={12} /> : <Eye size={12} />}</button>
              </div>
              <button onClick={handleChangePassword} disabled={changingPwd}
                className="h-8 px-4 rounded-md border border-border text-xs cursor-pointer bg-transparent hover:bg-muted disabled:opacity-50">
                {changingPwd ? '修改中...' : '通过旧密码修改'}
              </button>
            </div>

            <div className="pt-3 border-t border-border space-y-2">
              <label className="text-[11px] text-muted-foreground block">通过邮箱验证码修改（忘记密码时使用）</label>
              <div className="flex items-center gap-2">
                <button onClick={handleSendPwdCode} disabled={sendingPwdCode}
                  className="flex items-center gap-1 h-7 px-2 rounded-md text-[11px] border border-border cursor-pointer bg-transparent hover:bg-muted disabled:opacity-50">
                  <Mail size={10} /> {sendingPwdCode ? '发送中...' : '发送验证码'}
                </button>
                <input value={emailPwdCode} onChange={(e) => setEmailPwdCode(e.target.value)}
                  placeholder="验证码" maxLength={6}
                  className="w-24 h-7 px-2 rounded-md text-[11px] bg-background border border-border focus:outline-none" />
              </div>
              <input type="password" value={emailPwdNewPwd} onChange={(e) => setEmailPwdNewPwd(e.target.value)}
                placeholder="新密码" className="w-full h-8 px-2 rounded-md text-xs bg-background border border-border focus:outline-none" />
              <button onClick={handleChangePwdByEmail} disabled={changingPwdByEmail}
                className="h-8 px-4 rounded-md border border-border text-xs cursor-pointer bg-transparent hover:bg-muted disabled:opacity-50">
                {changingPwdByEmail ? '修改中...' : '通过验证码修改'}
              </button>
            </div>
          </Card>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-3">
            <Palette size={14} className="text-muted-foreground" />
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">外观</span>
          </div>
          <Card className="p-4">
            <div className="text-[11px] text-muted-foreground mb-2">主题</div>
            <div className="flex gap-2">
              {([{ value: 'light', label: '浅色' }, { value: 'dark', label: '深色' }, { value: 'system', label: '跟随系统' }] as const).map(({ value, label }) => (
                <button key={value} onClick={() => setTheme(value)}
                  className={cn(
                    'h-8 px-3 rounded-md text-xs border cursor-pointer bg-transparent transition-colors',
                    theme === value ? 'border-foreground bg-foreground/5 font-medium' : 'border-border hover:border-foreground/20',
                  )}>
                  {label}
                </button>
              ))}
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
