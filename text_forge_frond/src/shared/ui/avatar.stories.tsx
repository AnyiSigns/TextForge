// src/shared/ui/avatar.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
} from './avatar';

const meta = {
  title: 'UI/Avatar',
  component: Avatar,
  tags: ['autodocs'],
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Fallback: Story = {
  render: () => (
    <Avatar>
      <AvatarFallback>林</AvatarFallback>
    </Avatar>
  ),
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <Avatar size="sm"><AvatarFallback>小</AvatarFallback></Avatar>
      <Avatar size="default"><AvatarFallback>中</AvatarFallback></Avatar>
      <Avatar size="lg"><AvatarFallback>大</AvatarFallback></Avatar>
    </div>
  ),
};

export const Group: Story = {
  render: () => (
    <AvatarGroup>
      <Avatar><AvatarFallback>A</AvatarFallback></Avatar>
      <Avatar><AvatarFallback>B</AvatarFallback></Avatar>
      <Avatar><AvatarFallback>C</AvatarFallback></Avatar>
      <AvatarGroupCount>+5</AvatarGroupCount>
    </AvatarGroup>
  ),
};
