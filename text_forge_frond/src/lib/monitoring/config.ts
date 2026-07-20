// src/lib/monitoring/config.ts
import { APP_ENV, SENTRY_DSN, APP_VERSION } from '@/shared/config/env';

// 分层采样率：dev/test 关闭，staging 开，prod 开且错误率更高。
const sampleRateByEnv: Record<string, number> = {
  development: 0,
  test: 0,
  staging: 0.2,
  production: 0.5,
};

export const monitoringConfig = {
  env: APP_ENV,
  enabled: APP_ENV === 'staging' || APP_ENV === 'production',
  dsn: SENTRY_DSN,
  release: process.env.GITHUB_SHA || APP_VERSION,
  tracesSampleRate: sampleRateByEnv[APP_ENV] ?? 0,
  replaysSessionSampleRate: APP_ENV === 'production' ? 0.1 : 0,
  replaysErrorSampleRate: APP_ENV === 'production' ? 1.0 : 0,
};
