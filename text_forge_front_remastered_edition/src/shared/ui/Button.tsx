import { cn } from '@/shared/lib/cn';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'md' | 'sm' | 'xs';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

// 各 variant 的基础样式
const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-foreground text-background font-medium border-none cursor-pointer hover:opacity-90 disabled:opacity-50 transition-opacity',
  secondary: 'border border-border bg-transparent cursor-pointer hover:bg-muted disabled:opacity-50 transition-colors',
  ghost: 'border-none bg-transparent cursor-pointer hover:bg-muted disabled:opacity-50 transition-colors',
  danger:
    'border border-border bg-transparent cursor-pointer hover:bg-muted disabled:opacity-50 transition-colors text-destructive',
};

const sizeClasses: Record<ButtonSize, string> = {
  md: 'h-8 px-4 rounded-md text-xs',
  sm: 'h-7 px-3 rounded-md text-[11px]',
  xs: 'h-6 px-2 rounded-md text-[10px]',
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', type = 'button', ...props }, ref) => (
    <button ref={ref} type={type} className={cn(variantClasses[variant], sizeClasses[size], className)} {...props} />
  ),
);
Button.displayName = 'Button';
