// src/lib/monitoring/config.ts
export const monitoringConfig = {
  enabled: process.env.NODE_ENV === 'production',
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || '',
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0.1,
  replaysErrorSampleRate: 1.0,
};