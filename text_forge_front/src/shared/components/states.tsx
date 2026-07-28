// src/components/shared/states.tsx
'use client';

import type { LucideIcon } from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/** 居中加载态：细线旋转图标 + 文案 */
export function Spinner({ label = '加载中...', className }: { label?: string; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center gap-3 h-64 text-muted-foreground', className)}>
      <Loader2 className="w-6 h-6 animate-spin opacity-70" strokeWidth={1.8} />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

/** 统一空状态：图标 + 标题 + 描述 + 可选操作 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn(
      'flex flex-col items-center justify-center text-center gap-2 py-12 px-6 rounded-xl',
      'border border-dashed border-border/60 text-muted-foreground',
      className,
    )}>
      {Icon && <Icon className="w-7 h-7 mb-1 opacity-50" strokeWidth={1.6} />}
      <p className="text-sm font-medium text-foreground/80">{title}</p>
      {description && <p className="text-sm max-w-sm">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

/** 骨架屏占位块 */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('rounded-xl bg-muted/40 shimmer', className)} />;
}

/** 卡片网格骨架屏 */
export function SkeletonGrid({ count = 6, className }: { count?: number; className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-40" />
      ))}
    </div>
  );
}
