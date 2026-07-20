// src/shared/ui/separator.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Separator } from './separator';

const meta = {
  title: 'UI/Separator',
  component: Separator,
  tags: ['autodocs'],
} satisfies Meta<typeof Separator>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Horizontal: Story = {
  render: () => (
    <div className="w-64 space-y-3">
      <p className="text-sm">上方内容</p>
      <Separator />
      <p className="text-sm">下方内容</p>
    </div>
  ),
};

export const Vertical: Story = {
  render: () => (
    <div className="flex h-16 items-center gap-3">
      <span className="text-sm">左</span>
      <Separator orientation="vertical" />
      <span className="text-sm">右</span>
    </div>
  ),
};
