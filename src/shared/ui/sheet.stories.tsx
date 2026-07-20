// src/shared/ui/sheet.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import {
  Sheet,
  SheetTrigger,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from './sheet';
import { Button } from './button';

const meta = {
  title: 'UI/Sheet',
  component: Sheet,
  tags: ['autodocs'],
} satisfies Meta<typeof Sheet>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Sheet>
      <SheetTrigger render={<Button />}>打开侧栏</SheetTrigger>
      <SheetContent side="right">
        <SheetHeader>
          <SheetTitle>侧边面板</SheetTitle>
          <SheetDescription>用于承载次级操作与详情。</SheetDescription>
        </SheetHeader>
      </SheetContent>
    </Sheet>
  ),
};
