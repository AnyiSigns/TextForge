import { cn } from '@/shared/lib/cn';
import { HTMLAttributes, forwardRef } from 'react';

const ListRow = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn('flex items-center gap-3 p-3 rounded-lg border border-border/40 bg-card hover:bg-card/60 transition-colors', className)}
    {...props}
  />
));
ListRow.displayName = 'ListRow';

export { ListRow };
