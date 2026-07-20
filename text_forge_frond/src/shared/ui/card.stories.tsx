// src/shared/ui/card.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, CardAction } from './card';
import { Button } from './button';

const meta = {
  title: 'UI/Card',
  component: Card,
  tags: ['autodocs'],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card className="w-80">
      <CardHeader>
        <CardTitle>项目设定</CardTitle>
        <CardDescription>世界观与基础规则</CardDescription>
        <CardAction>
          <Button size="sm" variant="outline">编辑</Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">这是一段卡片正文内容，用于展示项目的基础设定信息。</p>
      </CardContent>
      <CardFooter>
        <Button size="sm">保存</Button>
      </CardFooter>
    </Card>
  ),
};

export const Small: Story = {
  render: () => (
    <Card size="sm" className="w-80">
      <CardHeader>
        <CardTitle>小型卡片</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground">紧凑间距的卡片变体。</p>
      </CardContent>
    </Card>
  ),
};
