'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/shared/stores/authStore';
import { cn } from '@/shared/lib/cn';
import { showApiError } from '@/shared/lib/apiError';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuthStore();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password !== confirmPassword) {
      toast.error('密码不一致', { description: '两次输入的密码不匹配' });
      return;
    }

    setIsLoading(true);
    try {
      await register(username, email, password);
      toast.success('注册成功', { description: '验证邮件已发送到你的邮箱' });
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err: unknown) {
      showApiError(err, '注册失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-sm">
        <h1 className="text-lg font-semibold text-center mb-6">创建账号</h1>
        <form onSubmit={handleSubmit} className="space-y-4 p-6 rounded-xl border border-border bg-card">
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full h-9 px-3 rounded-md text-sm bg-background border border-border focus:outline-none"
              placeholder="你的昵称"
              required
            />
          </div>
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
                placeholder="至少6位"
                required
                minLength={6}
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
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">确认密码</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full h-9 px-3 rounded-md text-sm bg-background border border-border focus:outline-none"
              placeholder="再次输入密码"
              required
            />
          </div>
          <button
            type="submit"
            disabled={isLoading}
            className={cn(
              'w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/85 border-none cursor-pointer',
              isLoading && 'opacity-50',
            )}
          >
            {isLoading ? '注册中...' : '注册'}
          </button>
          <div className="text-center text-xs text-muted-foreground">
            已有账号？{' '}
            <Link href="/login" className="text-foreground underline">
              去登录
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
