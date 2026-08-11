'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mail, Loader2, CheckCircle2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/shared/lib/cn';
import * as authApi from '@/shared/api/auth';

const CODE_LENGTH = 6;
const RESEND_COOLDOWN = 60;

type StatusType = 'info' | 'success' | 'error';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const urlEmail = searchParams.get('email');
  const [email, setEmail] = useState(urlEmail ?? '');
  const [status, setStatus] = useState<StatusType>('info');
  const [message, setMessage] = useState(
    urlEmail ? `验证邮件已发送到 ${urlEmail}` : '请输入邮箱获取验证码',
  );
  const [isResending, setIsResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [isVerifying, setIsVerifying] = useState(false);

  const [digits, setDigits] = useState<string[]>(Array(CODE_LENGTH).fill(''));
  const boxRefs = useRef<Array<HTMLInputElement | null>>([]);
  const code = digits.join('');

  const goLogin = useCallback(() => {
    setTimeout(() => router.push('/login'), 2000);
  }, [router]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const clearBoxes = () => {
    setDigits(Array(CODE_LENGTH).fill(''));
    boxRefs.current[0]?.focus();
  };

  const handleChange = (i: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setDigits((prev) => {
      const next = [...prev];
      next[i] = digit;
      return next;
    });
    if (digit && i < CODE_LENGTH - 1) boxRefs.current[i + 1]?.focus();
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      boxRefs.current[i - 1]?.focus();
    }
    if (e.key === 'Enter' && code.length === CODE_LENGTH) {
      handleVerifyCode();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
    if (!text) return;
    e.preventDefault();
    setDigits(Array(CODE_LENGTH).fill('').map((_, i) => text[i] ?? ''));
    boxRefs.current[Math.min(text.length, CODE_LENGTH - 1)]?.focus();
  };

  const handleResend = async () => {
    if (!email || isResending || cooldown > 0) return;
    setIsResending(true);
    try {
      await authApi.resendVerifyApi(email);
      toast.success('验证邮件已重新发送');
      setCooldown(RESEND_COOLDOWN);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '发送失败';
      toast.error('发送失败', { description: msg });
    } finally {
      setIsResending(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!email || code.length !== CODE_LENGTH || isVerifying) return;
    setIsVerifying(true);
    try {
      await authApi.verifyEmailApi(email, code);
      setStatus('success');
      setMessage('邮箱验证成功！');
      toast.success('邮箱验证成功');
      goLogin();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '验证失败';
      setStatus('error');
      setMessage(msg);
      clearBoxes();
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-xl font-semibold">邮箱验证</h1>
        <p className="text-sm text-muted-foreground">
          {status === 'success' ? '验证成功！' : status === 'error' ? '验证失败' : '请查收邮件'}
        </p>
      </div>

      <div
        className="rounded-xl border border-border bg-card shadow-sm p-6 space-y-4 auth-fade-up"
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-2 text-sm">
          <Mail size={16} className="text-muted-foreground shrink-0" />
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            autoComplete="email"
            className="w-full h-9 px-2 rounded-md text-sm bg-background border border-border focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 transition-colors"
          />
        </div>

        <p className="text-xs text-muted-foreground">{message}</p>

        {status !== 'success' && email && (
          <div className="space-y-4">
            <div className="flex justify-between gap-2" onPaste={handlePaste}>
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    boxRefs.current[i] = el;
                  }}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  aria-label={`验证码第 ${i + 1} 位`}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  className={cn(
                    'w-11 h-12 rounded-lg text-center text-lg font-semibold bg-background border',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 transition-colors',
                    status === 'error' ? 'border-destructive/60' : 'border-border',
                  )}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={handleVerifyCode}
              disabled={code.length !== CODE_LENGTH || isVerifying}
              className={cn(
                'w-full h-10 rounded-md bg-primary text-primary-foreground text-sm font-medium',
                'flex items-center justify-center gap-2 border-none cursor-pointer hover:bg-primary/85 transition-colors',
                (code.length !== CODE_LENGTH || isVerifying) && 'opacity-50',
              )}
            >
              {isVerifying ? <Loader2 size={16} className="animate-spin" /> : null}
              {isVerifying ? '验证中...' : '验证'}
            </button>

            <button
              type="button"
              onClick={handleResend}
              disabled={isResending || cooldown > 0}
              className="w-full h-8 rounded-md border border-border text-xs bg-transparent cursor-pointer hover:bg-muted transition-colors"
            >
              {isResending
                ? '发送中...'
                : cooldown > 0
                  ? `重新发送验证邮件（${cooldown}s）`
                  : '重新发送验证邮件'}
            </button>
          </div>
        )}

        {status === 'success' && (
          <div className="flex flex-col items-center gap-2 pt-2">
            <CheckCircle2 size={40} className="text-primary auth-pop-in" />
            <p className="text-xs text-muted-foreground">即将跳转登录...</p>
          </div>
        )}

        {status === 'error' && email && (
          <p className="text-xs text-destructive text-center">请检查验证码后重试，或点击下方重新发送</p>
        )}
      </div>

      <div className="text-center text-xs text-muted-foreground">
        <Link href="/login" className="inline-flex items-center gap-1 text-foreground underline">
          返回登录 <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
          加载中...
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
