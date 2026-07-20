// src/components/shared/PageHeader.tsx
'use client';

import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export function PageHeader({
  icon: Icon,
  title,
  description,
  className,
  actions,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className={cn('flex items-end justify-between gap-4 mb-6 animate-ink-rise', className)}>
      <div className="flex items-center gap-3">
        {Icon && (
          <span className="grid place-items-center w-11 h-11 rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15">
            <Icon className="w-5 h-5" strokeWidth={1.8} />
          </span>
        )}
        <div>
          <h1 className="text-2xl font-semibold tracking-tight font-heading">{title}</h1>
          {description && <p className="text-sm text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}
