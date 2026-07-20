// src/lib/utils/network.ts
// 纯工具层：只负责监听浏览器网络事件并以回调通知，不直接弹 UI（toast 由消费方决定）。
// 解耦原因：lib 不应依赖 sonner 等 UI 库，避免分层倒置。

export interface NetworkListenerHandlers {
  onOnline?: () => void;
  onOffline?: () => void;
}

export function setupNetworkListener(handlers: NetworkListenerHandlers = {}) {
  let hasShownOffline = false;

  const handleOnline = () => {
    hasShownOffline = false;
    handlers.onOnline?.();
  };

  const handleOffline = () => {
    if (!hasShownOffline) {
      hasShownOffline = true;
      handlers.onOffline?.();
    }
  };

  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  return () => {
    window.removeEventListener('online', handleOnline);
    window.removeEventListener('offline', handleOffline);
  };
}

export function isOnline(): boolean {
  return typeof navigator !== 'undefined' ? navigator.onLine : true;
}