'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/cn';
import * as authApi from '@/shared/api/auth';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const email = searchParams.get('email');
  type StatusType = 'verifying' | 'success' | 'error' | 'info';
  const [status, setStatus] = useState<StatusType>(token ? 'verifying' : 'info');
  const [message, setMessage] = useState(token ? '' : email ? `验证邮件已发送到 ${email}` : '请检查你的邮箱');
  const [isResending, setIsResending] = useState(false);
  const [inputCode, setInputCode] = useState('');
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    if (!token || !email) return;
    const verify = async () => {
      try {
        await authApi.verifyEmailApi(email, token);
        setStatus('success');
        setMessage('邮箱验证成功！');
        toast.success('邮箱验证成功');
        setTimeout(() => router.push('/login'), 2000);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : '验证失败';
        setStatus('error');
        setMessage(msg);
      }
    };
    verify();
  }, [token, email, router]);

  const handleResend = async () => {
    if (!email || isResending) return;
    setIsResending(true);
    try {
      await authApi.resendVerifyApi(email);
      toast.success('验证邮件已重新发送');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '发送失败';
      toast.error('发送失败', { description: msg });
    } finally {
      setIsResending(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!email || !inputCode || isVerifying) return;
    setIsVerifying(true);
    try {
      await authApi.verifyEmailApi(email, inputCode);
      setStatus('success');
      setMessage('邮箱验证成功！');
      toast.success('邮箱验证成功');
      setTimeout(() => router.push('/login'), 2000);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '验证失败';
      setStatus('error');
      setMessage(msg);
    } finally {
      setIsVerifying(false);
    }
  };

  const labelMap: Record<StatusType, string> = {
    verifying: '正在验证...',
    success: '验证成功！',
    error: '验证失败',
    info: '请查收邮件',
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm p-6 rounded-xl border border-border bg-card text-center space-y-4">
        <h1 className="text-lg font-semibold">邮箱验证</h1>
        <p className="text-xs text-muted-foreground">{labelMap[status]}</p>
        <p className="text-sm">{message}</p>

        {status === 'info' && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                maxLength={6}
                placeholder="请输入验证码"
                value={inputCode}
                onChange={(e) => setInputCode(e.target.value.replace(/\D/g, ''))}
                onKeyDown={(e) => { if (e.key === 'Enter') handleVerifyCode(); }}
                className="flex-1 h-9 px-3 rounded-md text-center text-lg tracking-widest bg-background border border-border focus:outline-none"
              />
              <button
                onClick={handleVerifyCode}
                disabled={!inputCode || isVerifying}
                className={cn(
                  'h-9 px-4 rounded-md bg-foreground text-background text-sm font-medium border-none cursor-pointer hover:opacity-90',
                  (!inputCode || isVerifying) && 'opacity-50',
                )}
              >
                {isVerifying ? '验证中' : '验证'}
              </button>
            </div>
            <button
              onClick={handleResend}
              disabled={isResending}
              className="w-full h-8 rounded-md border border-border text-xs bg-transparent cursor-pointer hover:bg-muted"
            >
              {isResending ? '发送中...' : '重新发送验证邮件'}
            </button>
          </div>
        )}

        {status === 'error' && (
          <button
            onClick={() => router.push('/register')}
            className="h-8 px-4 rounded-md border border-border text-xs bg-transparent cursor-pointer hover:bg-muted"
          >
            返回注册
          </button>
        )}

        {status === 'success' && (
          <p className="text-xs text-muted-foreground">即将跳转登录...</p>
        )}
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">加载中...</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}
