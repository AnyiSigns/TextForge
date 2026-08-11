'use client';

import { useEffect, useState } from 'react';
import { Eye, EyeOff, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { Card } from '@/shared/ui/card';
import { TextInput } from '@/shared/ui/TextInput';
import { Button } from '@/shared/ui/Button';
import * as userApi from '@/shared/api/user';

export function ProfileTab() {
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

  const [emailPwdCode, setEmailPwdCode] = useState('');
  const [emailPwdNewPwd, setEmailPwdNewPwd] = useState('');
  const [sendingPwdCode, setSendingPwdCode] = useState(false);
  const [changingPwdByEmail, setChangingPwdByEmail] = useState(false);

  useEffect(() => {
    userApi.fetchProfile().then((p) => {
      setUserName(p.username || '');
      setEmail(p.email || '');
      setOriginalEmail(p.email || '');
    }).catch(() => {});
  }, []);

  const handleSaveProfile = async () => {
    if (!userName.trim()) { toast.error('用户名不能为空'); return; }
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

  return (
    <Card className="p-5 space-y-5">
      <div className="space-y-3">
        <label className="text-[11px] text-muted-foreground block">用户名</label>
        <TextInput value={userName} onChange={(e) => setUserName(e.target.value)} />
      </div>
      <div className="space-y-3">
        <label className="text-[11px] text-muted-foreground block">邮箱</label>
        <TextInput value={email} onChange={(e) => setEmail(e.target.value)} />
        {email !== originalEmail && (
          <div className="flex items-center gap-2">
            <Button size="sm" onClick={handleSaveProfile} disabled={savingProfile}>
              {savingProfile ? '保存中...' : '保存'}
            </Button>
            <span className="text-[10px] text-muted-foreground">修改邮箱后需保存验证</span>
          </div>
        )}
      </div>
      <div className="flex justify-end">
        <Button onClick={handleSaveProfile} disabled={savingProfile}>
          {savingProfile ? '保存中...' : '保存个人资料'}
        </Button>
      </div>

      <div className="pt-4 border-t border-border space-y-3">
        <label className="text-[11px] text-muted-foreground block">通过旧密码修改</label>
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

      <div className="pt-4 border-t border-border space-y-3">
        <label className="text-[11px] text-muted-foreground block">通过邮箱验证码修改（忘记密码时使用）</label>
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
  );
}
