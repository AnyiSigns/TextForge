// src/shared/ui/table.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
} from './table';

const meta = {
  title: 'UI/Table',
  component: Table,
  tags: ['autodocs'],
} satisfies Meta<typeof Table>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Table>
      <TableCaption>项目步骤概览</TableCaption>
      <TableHeader>
        <TableRow>
          <TableHead>步骤</TableHead>
          <TableHead>Agent</TableHead>
          <TableHead>状态</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        <TableRow>
          <TableCell>大纲生成</TableCell>
          <TableCell>outline-agent</TableCell>
          <TableCell>已完成</TableCell>
        </TableRow>
        <TableRow>
          <TableCell>正文创作</TableCell>
          <TableCell>writer-agent</TableCell>
          <TableCell>进行中</TableCell>
        </TableRow>
      </TableBody>
      <TableFooter>
        <TableRow>
          <TableCell colSpan={3}>共 2 条</TableCell>
        </TableRow>
      </TableFooter>
    </Table>
  ),
};
