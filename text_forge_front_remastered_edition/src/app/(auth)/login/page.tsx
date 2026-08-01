'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <form onSubmit={(e) => { e.preventDefault(); router.push('/books/1'); }} className="w-full max-w-sm space-y-4 p-6 rounded-xl border border-border bg-card">
        <h1 className="text-lg font-semibold text-center">TextForge</h1>
        <div>
          <label className="text-xs text-muted-foreground">邮箱</label>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full mt-1 h-9 px-3 rounded-md text-sm bg-background border border-border focus:outline-none focus:ring-2 focus:ring-ring" placeholder="your@email.com" />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">密码</label>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="w-full mt-1 h-9 px-3 rounded-md text-sm bg-background border border-border focus:outline-none focus:ring-2 focus:ring-ring" placeholder="••••••" />
        </div>
        <button type="submit" className="w-full h-9 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/85">登录</button>
      </form>
    </div>
  );
}
