// src/shared/ui/select.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectGroup,
  SelectSeparator,
} from './select';

const meta = {
  title: 'UI/Select',
  component: Select,
  tags: ['autodocs'],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Select defaultValue="fantasy">
      <SelectTrigger className="w-48">
        <SelectValue placeholder="选择类型" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>文学类型</SelectLabel>
          <SelectItem value="fantasy">奇幻</SelectItem>
          <SelectItem value="scifi">科幻</SelectItem>
          <SelectItem value="romance">言情</SelectItem>
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          <SelectLabel>其他</SelectLabel>
          <SelectItem value="history">历史</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  ),
};
