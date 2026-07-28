// src/shared/ui/tabs.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from './tabs';

const meta = {
  title: 'UI/Tabs',
  component: Tabs,
  tags: ['autodocs'],
} satisfies Meta<typeof Tabs>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-96">
      <TabsList>
        <TabsTrigger value="overview">概览</TabsTrigger>
        <TabsTrigger value="chars">角色</TabsTrigger>
        <TabsTrigger value="outline">大纲</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="p-3">项目概览内容</TabsContent>
      <TabsContent value="chars" className="p-3">角色列表内容</TabsContent>
      <TabsContent value="outline" className="p-3">大纲内容</TabsContent>
    </Tabs>
  ),
};

export const Line: Story = {
  render: () => (
    <Tabs defaultValue="a" className="w-96">
      <TabsList variant="line">
        <TabsTrigger value="a">标签 A</TabsTrigger>
        <TabsTrigger value="b">标签 B</TabsTrigger>
      </TabsList>
      <TabsContent value="a" className="p-3">内容 A</TabsContent>
      <TabsContent value="b" className="p-3">内容 B</TabsContent>
    </Tabs>
  ),
};
