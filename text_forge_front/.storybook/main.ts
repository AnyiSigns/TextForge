// .storybook/main.ts
// Storybook 10 + Vite 配置（项目级，零侵入：不改 Next/根配置）。
// 仅用于预览 src/shared/ui 的纯 React 原子组件（不依赖 next/* 服务端特性）。
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  stories: ['../src/**/*.stories.@(ts|tsx)'],
  addons: ['@storybook/addon-a11y'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  core: {
    disableTelemetry: true,
  },
  viteFinal: async (viteConfig) => {
    // Vite 8 原生支持 tsconfig paths 解析，复用 tsconfig.json 的 @/* 别名。
    viteConfig.resolve = viteConfig.resolve || {};
    viteConfig.resolve.tsconfigPaths = true;
    return viteConfig;
  },
};

export default config;
