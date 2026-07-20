// src/shared/components/ErrorBoundary.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';

vi.mock('@/lib/monitoring', () => ({
  captureException: vi.fn(),
}));

function Boom({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) throw new Error('child boom');
  return <div>正常内容</div>;
}

describe('ErrorBoundary', () => {
  it('子组件正常时渲染子内容', () => {
    render(
      <ErrorBoundary>
        <div>正常内容</div>
      </ErrorBoundary>,
    );
    expect(screen.getByText('正常内容')).toBeInTheDocument();
  });

  it('子组件抛错时显示降级 UI 而非崩溃', async () => {
    render(
      <ErrorBoundary>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );
    await waitFor(() => expect(screen.getByText('组件渲染出错')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: '恢复' })).toBeInTheDocument();
  });

  it('点击恢复后清空错误状态（重新挂载子树）', async () => {
    const { captureException } = await import('@/lib/monitoring');
    function SelfHeal() {
      const [boom, setBoom] = useState(true);
      return (
        <div>
          <button onClick={() => setBoom(false)}>修复</button>
          <ErrorBoundary>
            <Boom shouldThrow={boom} />
          </ErrorBoundary>
        </div>
      );
    }
    render(<SelfHeal />);
    await waitFor(() => expect(screen.getByText('组件渲染出错')).toBeInTheDocument());
    expect(captureException).toHaveBeenCalled();
    fireEvent.click(screen.getByText('修复'));
    fireEvent.click(screen.getByRole('button', { name: '恢复' }));
    await waitFor(() => expect(screen.getByText('正常内容')).toBeInTheDocument());
  });

  it('提供自定义 fallback', () => {
    render(
      <ErrorBoundary fallback={() => <div>自定义降级</div>}>
        <Boom shouldThrow />
      </ErrorBoundary>,
    );
    expect(screen.getByText('自定义降级')).toBeInTheDocument();
  });
});
