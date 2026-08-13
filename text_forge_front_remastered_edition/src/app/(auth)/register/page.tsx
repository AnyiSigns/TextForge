'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Mail, User, Lock, Loader2, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';
import { useAuthStore } from '@/shared/stores/authStore';
import { cn } from '@/shared/lib/cn';
import { showApiError } from '@/shared/lib/apiError';
import { LegalDocsModal, type LegalDocKind } from './LegalDocsModal';

const inputCls =
  'w-full h-10 pl-9 pr-3 rounded-lg text-sm bg-background border border-border ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:border-foreground/30 transition-colors';

export default function RegisterPage() {
  const router = useRouter();
  const { register } = useAuthStore();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [docKind, setDocKind] = useState<LegalDocKind | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!agreed) {
      toast.error('请先阅读并同意《用户协议》与《免责声明》');
      return;
    }
    if (username.length < 3 || username.length > 50) {
      toast.error('用户名长度需为 3-50 位');
      return;
    }
    if (password.length < 6 || password.length > 50) {
      toast.error('密码长度需为 6-50 位');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('密码不一致', { description: '两次输入的密码不匹配' });
      return;
    }

    setIsLoading(true);
    try {
      const { email_sent } = await register(username, email, password);
      if (email_sent) {
        toast.success('注册成功', { description: '验证邮件已发送到你的邮箱' });
      } else {
        toast.warning('注册成功，但验证邮件发送失败', {
          description: '请在验证页点击「重新发送验证邮件」',
        });
      }
      router.push(`/verify-email?email=${encodeURIComponent(email)}`);
    } catch (err: unknown) {
      showApiError(err, '注册失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="w-full max-w-sm space-y-6 auth-fade-up">
      <div className="text-center space-y-2">
        <h1 className="text-xl font-semibold">创建账号</h1>
        <p className="text-sm text-muted-foreground">开始构建你的世界观与故事</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-border bg-card p-6 shadow-sm">
        <div>
          <label htmlFor="reg-username" className="text-xs text-muted-foreground block mb-1.5">
            用户名
          </label>
          <div className="relative">
            <User size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              id="reg-username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputCls}
              placeholder="你的昵称（3-50 位）"
              autoComplete="username"
              minLength={3}
              maxLength={50}
              required
            />
          </div>
        </div>

        <div>
          <label htmlFor="reg-email" className="text-xs text-muted-foreground block mb-1.5">
            邮箱
          </label>
          <div className="relative">
            <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              id="reg-email"
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
          <label htmlFor="reg-password" className="text-xs text-muted-foreground block mb-1.5">
            密码
          </label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              id="reg-password"
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={cn(inputCls, 'pr-9')}
              placeholder="至少 6 位"
              autoComplete="new-password"
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

        <div>
          <label htmlFor="reg-confirm" className="text-xs text-muted-foreground block mb-1.5">
            确认密码
          </label>
          <div className="relative">
            <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              id="reg-confirm"
              type={showConfirm ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className={cn(inputCls, 'pr-9')}
              placeholder="再次输入密码"
              autoComplete="new-password"
              minLength={6}
              maxLength={50}
              required
            />
            <button
              type="button"
              onClick={() => setShowConfirm(!showConfirm)}
              aria-label={showConfirm ? '隐藏密码' : '显示密码'}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground bg-transparent border-none cursor-pointer hover:text-foreground"
            >
              {showConfirm ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
        </div>

        <label className="flex items-start gap-2 text-[11px] leading-relaxed text-muted-foreground cursor-pointer select-none">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 size-3.5 accent-foreground cursor-pointer shrink-0"
          />
          <span>
            我已阅读并同意
            <button
              type="button"
              onClick={() => setDocKind('agreement')}
              className="underline underline-offset-2 text-foreground/80 hover:text-foreground bg-transparent border-none cursor-pointer px-0.5"
            >
              《用户协议》
            </button>
            和
            <button
              type="button"
              onClick={() => setDocKind('disclaimer')}
              className="underline underline-offset-2 text-foreground/80 hover:text-foreground bg-transparent border-none cursor-pointer px-0.5"
            >
              《免责声明》
            </button>
          </span>
        </label>

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
          {isLoading ? '注册中...' : '注册'}
        </button>

        <div className="text-center text-xs text-muted-foreground">
          已有账号？{' '}
          <Link href="/login" className="inline-flex items-center gap-0.5 text-foreground underline">
            去登录 <ArrowRight size={12} />
          </Link>
        </div>
      </form>

      <LegalDocsModal kind={docKind} onClose={() => setDocKind(null)} />
    </div>
  );
}
