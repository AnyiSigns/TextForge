// tests/setup.ts
// vitest 全局测试环境初始化：jsdom 缺失的浏览器 API polyfill。
// 纯函数测试用不到这些，但为后续组件测试（zustand store / React 组件）提前铺路。

// jsdom 未实现 matchMedia，很多组件（响应式布局、主题切换）会直接调用
if (typeof window !== 'undefined' && !window.matchMedia) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

// ResizeObserver：地图画布、滚动条等组件依赖
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  Object.defineProperty(window, 'ResizeObserver', {
    writable: true,
    value: ResizeObserverMock,
  });
}

// IntersectionObserver：懒加载 / 滚动检测组件依赖
if (typeof window !== 'undefined' && !window.IntersectionObserver) {
  class IntersectionObserverMock {
    constructor(callback: IntersectionObserverCallback) {
      this.callback = callback;
    }
    private callback: IntersectionObserverCallback;
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() {
      return [];
    }
    root = null;
    rootMargin = '';
    thresholds = [];
  }
  Object.defineProperty(window, 'IntersectionObserver', {
    writable: true,
    value: IntersectionObserverMock,
  });
}

// canvas 上下文：@xyflow/react 等渲染库在 jsdom 下需要 getContext 不抛错
if (typeof HTMLCanvasElement !== 'undefined') {
  HTMLCanvasElement.prototype.getContext = HTMLCanvasElement.prototype.getContext || (() => null);
}
