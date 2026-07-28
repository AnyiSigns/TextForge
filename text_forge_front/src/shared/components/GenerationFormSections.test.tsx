// src/shared/components/GenerationFormSections.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UseCaseTabs, GranularitySection } from '@/shared/components/GenerationFormSections';

function baseHandle(overrides: Record<string, unknown> = {}) {
  return {
    useCase: 'portrait' as const,
    setLocalUseCase: vi.fn(),
    granularity: 'chapter' as const,
    setGranularity: vi.fn(),
    chapterArtOnlyChapter: false,
    effectiveSteps: [{ id: 's1', agent: 'writer', content: '# 第一章\n正文' }],
    selectedStepId: '',
    setSelectedStepId: vi.fn(),
    setSelectedStepIds: vi.fn(),
    selectedStepIds: [],
    batchMode: 'single' as const,
    setBatchMode: vi.fn(),
    selectedStep: undefined,
    ...overrides,
  };
}

describe('GenerationFormSections - UseCaseTabs', () => {
  it('image 显示「角色立绘 / 章节插图」两个标签', () => {
    render(<UseCaseTabs kind="image" f={baseHandle()} />);
    expect(screen.getByText('角色立绘')).toBeInTheDocument();
    expect(screen.getByText('章节插图')).toBeInTheDocument();
  });

  it('video 显示三类标签', () => {
    render(<UseCaseTabs kind="video" f={baseHandle()} />);
    expect(screen.getByText('章节动画')).toBeInTheDocument();
    expect(screen.getByText('全书预告片')).toBeInTheDocument();
    expect(screen.getByText('角色卡动画')).toBeInTheDocument();
  });

  it('点击未锁定标签触发 setLocalUseCase', () => {
    const setLocalUseCase = vi.fn();
    render(<UseCaseTabs kind="image" f={baseHandle({ setLocalUseCase })} />);
    fireEvent.click(screen.getByText('章节插图'));
    expect(setLocalUseCase).toHaveBeenCalledWith('chapter_art');
  });

  it('forcedUseCase 存在时标签禁用不可切换', () => {
    const setLocalUseCase = vi.fn();
    render(
      <UseCaseTabs kind="image" forcedUseCase="portrait" f={baseHandle({ setLocalUseCase })} />,
    );
    fireEvent.click(screen.getByText('章节插图'));
    expect(setLocalUseCase).not.toHaveBeenCalled();
  });
});

describe('GenerationFormSections - GranularitySection', () => {
  it('渲染粒度选择（按章节推荐）', () => {
    render(<GranularitySection f={baseHandle()} />);
    expect(screen.getByText('生成粒度')).toBeInTheDocument();
    expect(screen.getByText('按章节（推荐）')).toBeInTheDocument();
  });

  it('chapter_art 模式隐藏「整本书」选项', () => {
    render(<GranularitySection f={baseHandle({ chapterArtOnlyChapter: true })} />);
    expect(screen.queryByText('整本书')).toBeNull();
  });

  it('切换批量为 batch 显示章节勾选', async () => {
    const setBatchMode = vi.fn();
    render(<GranularitySection f={baseHandle({ batchMode: 'batch', setBatchMode })} />);
    // 批量模式下渲染章节勾选列表（checkbox 数量与 effectiveSteps 对应）
    expect((await screen.findAllByRole('checkbox')).length).toBe(1);
  });
});
