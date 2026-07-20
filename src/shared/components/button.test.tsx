import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button } from '@/components/ui/button';

describe('Atomic 组件 - Button', () => {
  it('渲染默认按钮文本', () => {
    render(<Button>提交</Button>);
    expect(screen.getByRole('button', { name: '提交' })).toBeInTheDocument();
  });

  it('应用 variant 与 size 的类名', () => {
    render(<Button variant="outline" size="sm">次要</Button>);
    const btn = screen.getByRole('button', { name: '次要' });
    expect(btn).toHaveClass('border-border');
  });

  it('asChild 时透传为子元素', () => {
    render(
      <Button asChild>
        <a href="/x">链接</a>
      </Button>
    );
    expect(screen.getByRole('link', { name: '链接' })).toHaveAttribute('href', '/x');
  });

  it('disabled 时不可点击', () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>禁用</Button>);
    expect(screen.getByRole('button', { name: '禁用' })).toBeDisabled();
  });
});
