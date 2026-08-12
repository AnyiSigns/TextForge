// tests/initializer/InitializerRelations.test.tsx
// Step 2 复核表单关系链编辑器：此前 'relations' 字段类型无渲染器，
// 显示 [object Object]、编辑即把数组改写为字符串导致关系链丢失。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Initializer } from '@/app/(dashboard)/books/[id]/Initializer';
import { useInitializerStore } from '@/features/map/stores/initializerStore';
import type { ParsedStepResult } from '@/features/map/lib/wizardMarkdown';

vi.mock('@/features/map/stores/entityStore', () => {
  const state = { locations: [], characters: [], plotThreads: [], sceneEvents: [], volumes: [], chapters: [] };
  return {
    useEntityStore: Object.assign(
      (selector: (s: typeof state) => unknown) => selector(state),
      { getState: () => ({ loadFromApi: async () => {} }) },
    ),
  };
});

function setReviewItems() {
  useInitializerStore.setState({
    isOpen: true,
    currentStep: 2,
    review: true,
    items: [{
      name: '萧尘',
      roleType: '主角',
      aliases: [],
      status: '',
      description: '三皇子',
      spawnLocationName: '',
      relationships: [{ type: '师徒', targetName: '玄真道人', description: '名义师徒，实为仇人' }],
      customFields: {},
    }] as unknown as ParsedStepResult,
  });
}

describe('Step2 关系链复核表单（relations 渲染器）', () => {
  beforeEach(() => {
    setReviewItems();
  });

  it('关系链渲染为结构化编辑器，编辑不损坏数组', () => {
    render(<Initializer />);
    const targetInput = screen.getByDisplayValue('玄真道人') as HTMLInputElement;
    expect(targetInput.tagName).toBe('INPUT');
    fireEvent.change(targetInput, { target: { value: '苏璃' } });
    const items = useInitializerStore.getState().items as unknown as Array<Record<string, unknown>>;
    const rels = items[0].relationships as Array<Record<string, unknown>>;
    expect(Array.isArray(rels)).toBe(true);
    expect(rels[0].targetName).toBe('苏璃');
    expect(rels[0]).not.toBe('苏璃');
  });

  it('添加 / 删除关系行', () => {
    render(<Initializer />);
    fireEvent.click(screen.getByRole('button', { name: /添加关系/ }));
    let items = useInitializerStore.getState().items as unknown as Array<Record<string, unknown>>;
    expect(items[0].relationships as unknown[]).toHaveLength(2);
    fireEvent.click(screen.getAllByLabelText('删除关系')[0]);
    items = useInitializerStore.getState().items as unknown as Array<Record<string, unknown>>;
    expect(items[0].relationships as unknown[]).toHaveLength(1);
  });

  it('关系描述多行编辑保留', () => {
    render(<Initializer />);
    // 描述初始为只读 div（EditableField 非编辑态），点击进入编辑态后才是 textarea
    fireEvent.click(screen.getByText('名义师徒，实为仇人'));
    const desc = screen.getByDisplayValue('名义师徒，实为仇人') as HTMLTextAreaElement;
    fireEvent.change(desc, { target: { value: '修订后的关系描述' } });
    // 失焦回写（EditableField 在 onBlur 时 onChange）
    fireEvent.blur(desc);
    const items = useInitializerStore.getState().items as unknown as Array<Record<string, unknown>>;
    const rels = items[0].relationships as Array<Record<string, unknown>>;
    expect(rels[0].description).toBe('修订后的关系描述');
  });
});
