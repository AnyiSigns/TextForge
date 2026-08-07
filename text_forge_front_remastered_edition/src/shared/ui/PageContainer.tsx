import { cn } from '@/shared/lib/cn';
import { HTMLAttributes, forwardRef } from 'react';

const PageContainer = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('h-full overflow-y-auto theme-surface', className)} {...props} />
));
PageContainer.displayName = 'PageContainer';

export { PageContainer };
