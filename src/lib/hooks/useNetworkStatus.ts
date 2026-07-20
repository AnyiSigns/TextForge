// src/lib/hooks/useNetworkStatus.ts
import { useEffect, useRef, useState } from 'react';
import { setupNetworkListener, isOnline, type NetworkListenerHandlers } from '@/lib/utils/network';

// 纯逻辑 hook：监听网络状态变化并反映在 state 上。
// 若传入 onOnline/onOffline 回调（如弹 toast），由调用方决定 UI 行为，hook 本身不依赖 UI 库。
// handlers 用 ref 持有，避免调用方传入内联函数时每次渲染都重订阅 window 事件。
export function useNetworkStatus(handlers: NetworkListenerHandlers = {}) {
  const [online, setOnline] = useState(isOnline());
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    setOnline(isOnline());
    const cleanup = setupNetworkListener({
      onOnline: () => {
        setOnline(true);
        handlersRef.current.onOnline?.();
      },
      onOffline: () => {
        setOnline(false);
        handlersRef.current.onOffline?.();
      },
    });
    return cleanup;
  }, []);

  return { isOnline: online };
}