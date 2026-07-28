import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';

describe('Atomic 组件 - Card', () => {
  it('渲染组合卡片结构', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>标题</CardTitle>
          <CardDescription>描述</CardDescription>
        </CardHeader>
        <CardContent>内容</CardContent>
        <CardFooter>底部</CardFooter>
      </Card>
    );
    expect(screen.getByText('标题')).toBeInTheDocument();
    expect(screen.getByText('描述')).toBeInTheDocument();
    expect(screen.getByText('内容')).toBeInTheDocument();
    expect(screen.getByText('底部')).toBeInTheDocument();
  });

  it('data-slot 标记正确', () => {
    const { container } = render(
      <Card>
        <CardHeader />
      </Card>
    );
    expect(container.querySelector('[data-slot="card"]')).toBeInTheDocument();
    expect(container.querySelector('[data-slot="card-header"]')).toBeInTheDocument();
  });

  it('支持 size 与 glass 配置', () => {
    const { container } = render(<Card size="sm" glass={false} />);
    const card = container.querySelector('[data-slot="card"]')!;
    expect(card).toHaveAttribute('data-size', 'sm');
    expect(card).not.toHaveClass('glass-card');
  });
});
