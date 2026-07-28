# 0003 - 可观测性策略

- 状态：已落地（Accepted）
- 日期：2026-07

## 背景

前端无异常上报与错误兜底，线上问题难以定位；单个组件渲染异常会整页白屏。

## 决策

- `src/lib/monitoring/`：
  - `config.ts`：按环境开关 + DSN + release + 分层采样率（dev/test 关闭，staging 开 0.2，prod 开 0.5）。
  - `report.ts`：轻量上报层；有 DSN 走 Sentry 兼容接口，无 DSN 降级为 localStorage 环形缓冲（便于调试）。
  - `index.ts`：initMonitoring 注册全局 unhandledrejection / error 监听。
- `src/shared/components/ErrorBoundary.tsx`：class 组件 + 可降级 UI + onError 上报。
- 在 `app/layout.tsx` 全局挂载，并在高风险子树（workflow 编辑器 / 手稿编辑器 / 项目工作台）单独包裹。
- `app/error.tsx` 与 `app/global-error.tsx` 调用 `captureException`。

## 后果

- 正向：组件级故障隔离，异常可观测。
- 负向：环形缓冲仅在无 DSN 时生效，生产需接入真实 DSN 才能持久化。
