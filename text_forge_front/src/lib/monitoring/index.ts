// src/lib/monitoring/index.ts
import { monitoringConfig } from './config';
import { captureException, captureMessage, getRing } from './report';

let initialized = false;

export function initMonitoring(): void {
  if (initialized) return;
  initialized = true;
  if (typeof window !== 'undefined') {
    window.addEventListener('unhandledrejection', (e) => {
      captureException(e.reason instanceof Error ? e.reason : e.reason, {
        source: 'unhandledrejection',
      });
    });
    window.addEventListener('error', (e) => {
      captureException(e.error ?? e.message, { source: 'window.error' });
    });
  }
}

export { monitoringConfig, captureException, captureMessage, getRing };
