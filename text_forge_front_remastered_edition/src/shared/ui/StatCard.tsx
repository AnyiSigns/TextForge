import { cn } from '@/shared/lib/cn';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  className?: string;
}

export function StatCard({ icon: Icon, label, value, sub, className }: StatCardProps) {
  return (
    <div className={cn('flex items-center gap-3 rounded-lg border border-border/40 bg-card p-4 min-w-0', className)}>
      <div className="w-7 h-7 rounded-md bg-muted grid place-items-center shrink-0">
        <Icon size={14} strokeWidth={1.8} className="text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground truncate">{label}</div>
        <div className="text-lg font-semibold leading-tight tabular-nums truncate">{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground/70 truncate">{sub}</div>}
      </div>
    </div>
  );
}
