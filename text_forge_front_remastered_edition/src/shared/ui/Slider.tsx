import { cn } from '@/shared/lib/cn';
import { forwardRef, type InputHTMLAttributes } from 'react';

export type SliderProps = InputHTMLAttributes<HTMLInputElement>;

// 原生 range 滑块的浏览器样式覆盖
const sliderClasses =
  'w-full h-1.5 appearance-none bg-border rounded-full outline-none [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:cursor-pointer';

export const Slider = forwardRef<HTMLInputElement, SliderProps>(({ className, ...props }, ref) => (
  <input ref={ref} type="range" className={cn(sliderClasses, className)} {...props} />
));
Slider.displayName = 'Slider';
