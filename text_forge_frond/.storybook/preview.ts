// .storybook/preview.ts
// 全局预览：注入 Tailwind v4 样式与主题背景，使原子组件在 Storybook 中外观与 app 一致。
import type { Preview } from '@storybook/react';
import '../src/app/globals.css';

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
    backgrounds: {
      default: 'app',
      values: [
        { name: 'app', value: '#0a0a0a' },
        { name: 'light', value: '#ffffff' },
      ],
    },
  },
};

export default preview;
