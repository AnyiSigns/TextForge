// src/shared/ui/badge.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Badge } from './badge';

const meta = {
  title: 'UI/Badge',
  component: Badge,
  tags: ['autodocs'],
  args: { children: 'Badge' },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap gap-3">
      <Badge {...args} variant="default">Default</Badge>
      <Badge {...args} variant="secondary">Secondary</Badge>
      <Badge {...args} variant="outline">Outline</Badge>
      <Badge {...args} variant="destructive">Destructive</Badge>
      <Badge {...args} variant="ghost">Ghost</Badge>
      <Badge {...args} variant="link">Link</Badge>
    </div>
  ),
};
