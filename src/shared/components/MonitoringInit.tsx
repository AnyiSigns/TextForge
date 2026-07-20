// src/shared/components/MonitoringInit.tsx
'use client';

import { useEffect } from 'react';
import { initMonitoring } from '@/lib/monitoring';

// 在根布局挂载一次，注册全局异常监听（仅启用时生效）。
export function MonitoringInit() {
  useEffect(() => {
    initMonitoring();
  }, []);
  return null;
}
