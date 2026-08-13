import { cn } from '@/shared/lib/cn';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface PageHeaderProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  backHref?: string;
  search?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
  backHref,
  search,
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border shadow-header theme-surface', className)}>
      <div className="px-4 sm:px-6 py-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            {backHref && (
              <Link href={backHref} className="text-muted-foreground hover:text-foreground shrink-0" aria-label="返回">
                <ArrowLeft size={20} strokeWidth={1.6} />
              </Link>
            )}
            {Icon && <Icon size={20} strokeWidth={1.6} className="text-muted-foreground shrink-0" />}
            <div className="min-w-0">
              <h1 className="text-lg font-semibold truncate">{title}</h1>
              {description && <p className="text-xs text-muted-foreground truncate">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">{actions}</div>}
        </div>
        {search && <div className="mt-4">{search}</div>}
      </div>
    </div>
  );
}
