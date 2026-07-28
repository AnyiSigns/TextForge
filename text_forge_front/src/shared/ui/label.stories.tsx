// src/shared/ui/label.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Label } from './label';
import { Input } from './input';

const meta = {
  title: 'UI/Label',
  component: Label,
  tags: ['autodocs'],
  args: { children: '用户名' },
} satisfies Meta<typeof Label>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: (args) => (
    <div className="grid gap-2 max-w-xs">
      <Label {...args} htmlFor="demo-input" />
      <Input id="demo-input" placeholder="请输入用户名" />
    </div>
  ),
};
