'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/shared/stores/authStore';
import { cn } from '@/shared/lib/cn';

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
      if (path === '/login' || path === '/register') return '/';
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
      const msg = err instanceof Error ? err.message : '登录失败';
      if (msg.includes('邮箱未验证')) {
        toast.error('邮箱未验证', { description: '请先验证邮箱后再登录' });
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
        return;
      }
      toast.error('登录失败', { description: msg });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-lg font-semibold text-center mb-6">TextForge</h1>
        <form onSubmit={handleSubmit} className="space-y-4 p-6 rounded-xl border border-border bg-card">
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">邮箱</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-9 px-3 rounded-md text-sm bg-background border border-border focus:outline-none"
              placeholder="your@email.com"
              required
            />
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">密码</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full h-9 px-3 pr-9 rounded-md text-sm bg-background border border-border focus:outline-none"
                placeholder="输入密码"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground bg-transparent border-none cursor-pointer"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className={cn(
              'w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/85 border-none cursor-pointer',
              isLoading && 'opacity-50',
            )}
          >
            {isLoading ? '登录中...' : '登录'}
          </button>
          <div className="text-center text-xs text-muted-foreground">
            还没有账号？{' '}
            <Link href="/register" className="text-foreground underline">
              立即注册
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
