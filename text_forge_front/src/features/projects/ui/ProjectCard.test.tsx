import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

vi.mock('@/lib/storage/backupExport', () => ({
  exportBookJson: vi.fn().mockResolvedValue(undefined),
  exportBookMarkdown: vi.fn().mockResolvedValue(undefined),
  exportBookText: vi.fn().mockResolvedValue(undefined),
}));
const state = {
  characters: [] as unknown[],
  settings: {} as Record<string | number, unknown>,
  portfolio: [] as unknown[],
  projects: [] as unknown[],
};

vi.mock('@/features/characters', () => ({
  useCharacterStore: (sel: (s: unknown) => unknown) => sel({ characters: state.characters }),
}));
vi.mock('@/features/manuscript', () => ({
  useManuscriptStore: (sel: (s: unknown) => unknown) => sel({ chapters: [] as unknown[] }),
}));
vi.mock('@/features/projects', () => ({
  STATUS_MAP: {
    draft: { label: '草稿', icon: vi.fn(), variant: 'outline' },
    generating: { label: '生成中', icon: vi.fn(), variant: 'secondary' },
    completed: { label: '已完成', icon: vi.fn(), variant: 'default' },
    paused: { label: '已暂停', icon: vi.fn(), variant: 'outline' },
  },
  useCreativeSettingStore: (sel: (s: unknown) => unknown) => sel({ settings: state.settings }),
  usePortfolioStore: (sel: (s: unknown) => unknown) => sel({ portfolio: state.portfolio }),
  useProjectStore: (sel: (s: unknown) => unknown) => sel({ projects: state.projects }),
}));
vi.mock('sonner', () => ({ toast: { success: vi.fn() } }));

import { ProjectCard } from '@/features/projects/ui/ProjectCard';
import type { Book } from '@/types';

const baseBook: Book = {
  id: 1,
  title: '我的小说',
  description: '这是一段描述',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
};

describe('features/projects - ProjectCard', () => {
  it('渲染项目标题', () => {
    render(<ProjectCard book={baseBook} onDelete={vi.fn()} />);
    expect(screen.getByText('我的小说')).toBeInTheDocument();
  });

  it('展示创建与更新日期', () => {
    render(<ProjectCard book={baseBook} onDelete={vi.fn()} />);
    expect(screen.getByText(/创建:/)).toBeInTheDocument();
    expect(screen.getByText(/更新:/)).toBeInTheDocument();
  });

  it('点击删除按钮触发 onDelete', () => {
    const onDelete = vi.fn();
    const { container } = render(<ProjectCard book={baseBook} onDelete={onDelete} />);
    const deleteBtn = container.querySelector('button:has(svg.lucide-trash-2)') as HTMLButtonElement;
    expect(deleteBtn).toBeTruthy();
    fireEvent.click(deleteBtn);
    expect(onDelete).toHaveBeenCalledWith(1);
  });

  it('存在 wordCountGoal 时展示进度条', () => {
    state.settings = { 1: { totalWordGoal: 100 } };
    render(<ProjectCard book={baseBook} onDelete={vi.fn()} />);
    expect(screen.getByText('进度')).toBeInTheDocument();
  });
});
