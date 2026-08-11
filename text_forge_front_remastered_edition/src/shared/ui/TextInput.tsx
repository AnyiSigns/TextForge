import { cn } from '@/shared/lib/cn';
import { forwardRef, type InputHTMLAttributes, type ReactNode } from 'react';

export interface TextInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  size?: 'sm' | 'md';
  suffix?: ReactNode;
}

// 基础输入框样式
const baseClasses =
  'w-full bg-background border border-border focus:outline-none focus:border-foreground/30 transition-colors';

const sizeClasses: Record<NonNullable<TextInputProps['size']>, string> = {
  md: 'h-8 px-2.5 rounded-md text-xs',
  sm: 'h-7 px-2 rounded-md text-[11px]',
};

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(
  ({ className, size = 'md', suffix, ...props }, ref) => {
    const input = (
      <input ref={ref} className={cn(baseClasses, sizeClasses[size], suffix && 'pr-8', className)} {...props} />
    );
    if (!suffix) return input;
    // 有后缀时包 relative 容器，后缀绝对定位在右侧
    return (
      <div className="relative w-full">
        {input}
        <span className="absolute inset-y-0 right-2 flex items-center text-muted-foreground">{suffix}</span>
      </div>
    );
  },
);
TextInput.displayName = 'TextInput';
