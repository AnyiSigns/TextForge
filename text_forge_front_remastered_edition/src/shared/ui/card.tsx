import { cn } from '@/shared/lib/cn';
import { HTMLAttributes, forwardRef } from 'react';

const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('rounded-lg border border-border bg-card text-card-foreground', className)} {...props} />
));
Card.displayName = 'Card';

export { Card };
