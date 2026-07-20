// src/app/(auth)/verify-email/page.tsx
'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { API_URL } from '@/lib/config/env';

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const token = searchParams.get('token');
  const email = searchParams.get('email');
  type StatusType = 'verifying' | 'success' | 'error' | 'info';
  const [status, setStatus] = useState<StatusType>(token ? 'verifying' : 'info');
  const [message, setMessage] = useState(token ? '' : email ? `📧 验证邮件已发送到 ${email}` : '请检查你的邮箱');
  const [isResending, setIsResending] = useState(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) clearTimeout(redirectTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!token) return;
const verify = async () => {
       try {
         const res = await fetch(`${API_URL}/api/auth/verify-email`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.message || '验证失败');
        }
        setStatus('success');
        setMessage('邮箱验证成功！');
        toast.success('邮箱验证成功');
        redirectTimerRef.current = setTimeout(() => router.push('/login'), 2000);
      } catch (error: unknown) {
        const err = error instanceof Error ? error : new Error(String(error));
        setStatus('error');
        setMessage(err.message || '验证失败，请重试');
      }
    };
    verify();
  }, [token, router]);

const resendVerification = async () => {
     if (!email || isResending) return;
     setIsResending(true);
     try {
       const res = await fetch(`${API_URL}/api/auth/resend-verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.message || '发送失败');
      }
      toast.success('验证邮件已重新发送');
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      toast.error('发送失败', { description: err.message || '未知错误' });
    } finally {
      setIsResending(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle>邮箱验证</CardTitle>
          <CardDescription>
            {status === 'verifying' && '正在验证...'}
            {status === 'success' && '验证成功！'}
            {status === 'error' && '验证失败'}
            {status === 'info' && '请查收邮件'}
          </CardDescription>
        </CardHeader>
        <CardContent className="text-center space-y-4">
          <p className="text-sm">{message}</p>
          {status === 'info' && (
            <Button onClick={resendVerification} variant="outline" disabled={isResending}>
              {isResending ? '发送中...' : '重新发送验证邮件'}
            </Button>
          )}
          {status === 'error' && (
            <Button onClick={() => router.push('/register')}>返回注册</Button>
          )}
          {status === 'success' && (
            <p className="text-xs text-muted-foreground">即将跳转登录...</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">加载中...</div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}