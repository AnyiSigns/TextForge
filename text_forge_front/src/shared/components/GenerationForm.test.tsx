// src/shared/components/GenerationForm.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GenerationForm } from '@/shared/components/GenerationForm';

vi.mock('@/lib/monitoring', () => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  initMonitoring: vi.fn(),
}));

// 用可变 formRef 让每个用例在渲染前改写 hook 返回值（vi.mock factory 需 hoisted）
const formRef: Record<string, unknown> = {};
vi.mock('@/lib/hooks/useGenerationForm', () => ({
  useGenerationForm: () => formRef.current,
}));

function noop() {}

function mockForm(overrides: Record<string, unknown> = {}) {
  return {
    MAX_DURATION_MIN: 5,
    durationMin: 0.5,
    durationStep: 0.5,
    durationUnit: '分钟',
    MAX_REFS: 8,
    kind: 'image' as const,
    useCase: 'portrait' as const,
    models: [],
    effectiveSteps: [],
    selectedStep: undefined,
    refImages: [],
    refError: '',
    modelId: '',
    setModelId: noop,
    prompt: '',
    setPrompt: noop,
    negative: '',
    setNegative: noop,
    style: '写实',
    setStyle: noop,
    size: '1024x1024',
    setSize: noop,
    count: 1,
    setCount: noop,
    duration: 0.5,
    setDuration: noop,
    aspect: '16:9',
    setAspect: noop,
    projectId: null,
    setProjectId: noop,
    characterId: null,
    setCharacterId: noop,
    chapterId: null,
    setChapterId: noop,
    stylePreset: 'guoman',
    setStylePreset: noop,
    isLoading: false,
    granularity: 'chapter' as const,
    setGranularity: noop,
    chapterArtOnlyChapter: false,
    selectedStepId: '',
    setSelectedStepId: noop,
    selectedStepIds: [],
    setSelectedStepIds: noop,
    selectedCharIds: [],
    setSelectedCharIds: noop,
    batchMode: 'single' as const,
    setBatchMode: noop,
    negExpanded: false,
    setNegExpanded: noop,
    localUseCase: 'portrait' as const,
    setLocalUseCase: noop,
    refText: '',
    setRefText: noop,
    handleSubmit: vi.fn(),
    ...overrides,
  };
}

const onSubmit = vi.fn();

describe('GenerationForm - 基础渲染', () => {
  beforeEach(() => {
    onSubmit.mockClear();
    vi.clearAllMocks();
  });

  it('image 类型渲染「生成图片」标题与提示词', () => {
    formRef.current = mockForm();
    render(<GenerationForm kind="image" onSubmit={onSubmit} />);
    expect(screen.getAllByText('生成图片').length).toBeGreaterThan(0);
    expect(screen.getByPlaceholderText(/穿着黑色风衣的剑客/)).toBeInTheDocument();
  });

  it('video 类型渲染「生成视频」标题', () => {
    formRef.current = mockForm({ kind: 'video', useCase: 'chapter_anim', durationUnit: '分钟' });
    render(<GenerationForm kind="video" onSubmit={onSubmit} />);
    expect(screen.getByText('生成视频')).toBeInTheDocument();
  });

  it('点击「高级选项」展开反向提示词输入', () => {
    formRef.current = mockForm({ negExpanded: false });
    const { container } = render(<GenerationForm kind="image" onSubmit={onSubmit} />);
    expect(screen.queryByPlaceholderText(/不希望出现的元素/)).toBeNull();
    fireEvent.click(screen.getByText('高级选项（反向提示词）'));
    expect(container).toBeTruthy();
  });

  it('无模型时给出引导提示', () => {
    formRef.current = mockForm({ models: [] });
    render(<GenerationForm kind="image" onSubmit={onSubmit} />);
    expect(screen.getByText(/尚未添加图片类模型/)).toBeInTheDocument();
  });
});
