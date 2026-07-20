# 目录与边界约定（Feature-Sliced 收敛）

本仓库已按 Feature-Sliced 思路收敛，目录分三层，边界规则如下。

## 三层边界

| 层 | 目录 | 可见性 | 职责 | 可依赖 |
|----|------|--------|------|--------|
| 平台层 | `src/lib/*` | 公开（最底层） | 与业务无关的纯能力：持久化、RAG、向量检索、种子、监控、校验、认证 cookie、日志、网络状态、生成服务、全局认证 store | 仅依赖自身与 `shared` |
| 公开层 | `src/shared/*` | 公开 | 跨业务复用物：UI 基元 `ui`、通用工具 `lib/utils` 与 `lib/agentRoles`、通用请求层 `lib/apiClient` 等、通用组件 `components`、布局 `layout`、环境 `config` | 可依赖 `lib`（平台层） |
| 业务切片 | `src/features/<name>/{ui,hooks,api,stores}` | **私有** | 单业务领域逻辑与视图 | 可依赖 `shared` 与 `lib`；**禁止**深路径直连其它 feature 内部文件 |

## features 私有规则（重要）

- 每个 feature 用 `index.ts` 作为**唯一公开出口（barrel）**，导出对外需要的组件 / hook / store / api 函数 / 类型。
- 其它切片、页面、平台层只应 `import ... from '@/features/<name>'`，**不得** `import ... from '@/features/<name>/ui/X'` 或 `.../hooks/X`。
- feature **内部**文件之间用相对路径（`./`、`../`）引用，不绕 barrel。
- 跨 feature 依赖只允许"下游消费上游的 barrel"，形成有向无环图；出现双向依赖说明边界划分有误，应把共享部分下沉到 `shared` 或 `lib`。

## 已落地的 feature 切片

- `features/projects` — 项目域（ui/hooks/api/stores，含 portfolioStore、briefStore）
- `features/characters` — 角色域（ui/api/stores）
- `features/workflow` — 工作流域（ui/api）；`agentRoles` 因被多业务共享，下沉为 `shared/lib/agentRoles`
- `features/manuscript` — 稿件域（ui/hooks/stores）
- `features/settings` — 设置域（ui/stores/api，含模型预设 templates）

## 平台层 `lib` 保留内容

`rag`、`storage`、`seed`、`auth`、`events`、`monitoring`、`validation`、`hooks`（通用：后端状态/网络/嵌入/生成表单）、`api/generation`、`stores/authStore`（全局认证）、`knowledge.ts`、`logger.ts`。

## 别名约定

`tsconfig.json` 的 `paths` 与 `vitest.config.ts` 的 `alias` 保持同步，旧路径（`@/components/ui`、`@/lib/utils`、`@/lib/config`、`@/lib/api/client` 等）已通过别名映射到新位置，作为过渡；**新代码一律使用 `@/shared/*`、`@/features/*`**。

## 度量现状

- `lib/` 行数占比已显著下降（业务混装 hook/api/store 已归入 features）。
- 空/虚目录已清零（`components/`、`app/dev` 已消除）。
- 架构文档见本文件。
