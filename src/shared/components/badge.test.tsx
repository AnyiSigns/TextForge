import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Badge } from '@/components/ui/badge';

describe('Atomic 组件 - Badge', () => {
  it('渲染默认徽标', () => {
    render(<Badge>新</Badge>);
    expect(screen.getByText('新')).toBeInTheDocument();
  });

  it('支持不同 variant', () => {
    const { rerender } = render(<Badge variant="secondary">次</Badge>);
    expect(screen.getByText('次')).toHaveClass('bg-secondary');
    rerender(<Badge variant="destructive">危</Badge>);
    expect(screen.getByText('危')).toHaveClass('bg-destructive/10');
  });

  it('允许自定义渲染标签', () => {
    render(<Badge render={<a href="/b" />}>链接徽标</Badge>);
    expect(screen.getByRole('link', { name: '链接徽标' })).toHaveAttribute('href', '/b');
  });
});
