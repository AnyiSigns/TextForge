// src/shared/ui/scroll-area.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { ScrollArea } from './scroll-area';

const meta = {
  title: 'UI/ScrollArea',
  component: ScrollArea,
  tags: ['autodocs'],
} satisfies Meta<typeof ScrollArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <ScrollArea className="h-40 w-64 rounded-lg border border-border p-3">
      {Array.from({ length: 20 }).map((_, i) => (
        <p key={i} className="py-1 text-sm text-muted-foreground">
          列表项 #{i + 1}
        </p>
      ))}
    </ScrollArea>
  ),
};
