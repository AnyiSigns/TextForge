'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Mail, Lock, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/shared/stores/authStore';
import { cn } from '@/shared/lib/cn';
import { getApiErrorMessage, showApiError } from '@/shared/lib/apiError';

const inputCls =
  'w-full h-10 pl-9 pr-3 rounded-lg text-sm bg-background border border-border ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-foreground/30 transition-colors';

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const getRedirect = () => {
    if (typeof window === 'undefined') return '/';
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect');
    if (!redirect) return '/';
    try {
      const url = new URL(redirect, window.location.origin);
      if (url.origin !== window.location.origin) return '/';
      const path = url.pathname;
      if (path === '/login' || path === '/register' || path === '/verify-email') return '/';
      return path + url.search + url.hash;
    } catch {
      return '/';
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    try {
      await login(email, password);
      toast.success('登录成功');
      router.push(getRedirect());
    } catch (err: unknown) {
      const msg = getApiErrorMessage(err, '登录失败');
      if (msg.includes('邮箱未验证')) {
        showApiError(err, '邮箱未验证');
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      showApiError(err, '登录失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm space-y-6 auth-fade-up">
      <div className="text-center space-y-2">
        <h1 className="text-xl font-semibold">欢迎回来</h1>
        <p className="text-sm text-muted-foreground">登录 TextForge，继续你的创作</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div>
          <label htmlFor="login-email" className="text-xs text-muted-foreground block mb-1.5">
            邮箱
          </label>
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              id="login-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="your@email.com"
              autoComplete="email"
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="login-password" className="text-xs text-muted-foreground block mb-1.5">
            密码
          </label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              id="login-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={cn(inputCls, 'pr-9')}
              placeholder="输入密码"
              autoComplete="current-password"
              minLength={6}
              maxLength={50}
              required
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label={showPassword ? '隐藏密码' : '显示密码'}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground bg-transparent border-none cursor-pointer hover:text-foreground"
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <button
          type="submit"
          disabled={isLoading}
          aria-busy={isLoading}
          className={cn(
            'w-full h-10 rounded-lg bg-primary text-primary-foreground text-sm font-medium',
            'flex items-center justify-center gap-2 border-none cursor-pointer hover:bg-primary/85 transition-colors',
            isLoading && 'opacity-60',
          )}
        >
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : null}
          {isLoading ? '登录中...' : '登录'}
        </button>

        <div className="text-center text-xs text-muted-foreground">
          还没有账号？{' '}
          <Link href="/register" className="inline-flex items-center gap-0.5 text-foreground underline">
            立即注册 <ArrowRight size={12} />
          </Link>
        </div>
      </form>
    </div>
  );
}
