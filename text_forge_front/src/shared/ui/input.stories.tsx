// src/shared/ui/input.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Input } from './input';

const meta = {
  title: 'UI/Input',
  component: Input,
  tags: ['autodocs'],
  args: { placeholder: '请输入...', className: 'max-w-xs' },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Disabled: Story = {
  args: { disabled: true, placeholder: '禁用状态' },
};

export const WithValue: Story = {
  args: { defaultValue: '林惊羽' },
};
