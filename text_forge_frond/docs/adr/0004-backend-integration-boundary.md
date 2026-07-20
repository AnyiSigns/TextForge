# 0004 - 后端对接边界（先前端后后端，后端只对接）

- 状态：已落地（Accepted）
- 日期：2026-07

## 背景

后端尚未就绪，但前端需保持不被后端阻塞；同时需保证「后端只对接」可落地——即前端已预留好注入点，后端按契约实现即可接入。

## 决策

### 前端已预留的注入点

- `generateWithWorkflow` 的 `runOpts.generate`：真实模型生成器插槽，后端就绪时传入消费 `(node, context, tier, ragChunks, systemPrompt, projectContext)` 的函数。
- `bindWorkflow`：静默回退（后端未就绪时 catch 忽略），本地 store 已维护 workflowId。
- `fetchProjectPortfolio`：聚合回退到子接口，单接口失败时降级而非全失败。

### 后端需实现的端点集合（以 `openapi/seed-api.yaml` 为准）

- `GET/POST /api/projects`、`GET/PUT/DELETE /api/projects/{id}`
- `PUT /api/projects/{id}/steps/{stepId}`、`POST /api/projects/{id}/confirm`、`POST /api/projects/{id}/generate`
- `GET/POST /api/characters`、`GET/PUT/DELETE /api/characters/{id}`、`POST /api/characters/{id}/avatar`
- `GET /api/characters/{id}/messages`、`POST /api/characters/{id}/chat`
- `GET /api/workflow`

### Zero-后端可运行

- dev 期 `NEXT_PUBLIC_API_URL=''` 时全部请求走 `src/mocks/`（proxy.ts 拦截 /api/*）。
- CI 的 e2e 也跑 mock 模式，不依赖后端存活。

### 契约漂移防护

- CI 增加 `typegen:check`（生成 `src/types/generated.ts` 后 `git diff` 非空则失败），保证「契约 → 类型」链路不脱节。
- 关键端点响应经 `src/lib/validation/responses.ts` 的 zod schema 校验，防后端脏数据导致白屏。

## 后果

- 正向：前后端解耦，前端可独立演进；契约作为唯一事实源。
- 负向：zod 校验为额外维护成本，契约变更需同步更新 yaml 与 schema。
