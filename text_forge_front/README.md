# Text Forge

AI 驱动的小说创作工具：项目管理、角色建模、知识库、以及 AI 图片/视频生成。前端采用 Next.js（App Router）+ React 19 + TypeScript，代码按 Feature-Sliced 组织。

## 本地启动

```bash
npm install        # 安装依赖（含 husky 准备钩子）
npm run dev        # 启动开发服务器 http://localhost:3000
```

> 开发期默认 `NEXT_PUBLIC_API_URL` 留空，前端请求走同源 `/api/*`，由 `src/mocks` 的 dev mock 拦截，**无需启动后端**即可演示「创建 → 列表 → 编辑 → 删除」全链路。

## 环境变量

复制 `.env.example` 为 `.env.development` / `.env.production` 后按需修改（所有公开变量须以 `NEXT_PUBLIC_` 开头）：

| 变量 | 说明 | 默认 |
| --- | --- | --- |
| `NEXT_PUBLIC_ENV` | 环境标识：`development` / `staging` / `production`，影响监控开关与采样率 | `development` |
| `NEXT_PUBLIC_API_URL` | 后端基地址；开发期留空走 dev mock | 开发期空串 |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry 兼容 DSN；留空时监控降级为本地环形缓冲 | 空 |
| `NEXT_PUBLIC_APP_VERSION` | 应用版本号（监控按版本聚合） | `text-forge@<env>` |

## 提交规范（Conventional Commits）

提交信息须符合 `commitlint` 校验，类型限定为：
`feat` / `fix` / `refactor` / `chore` / `docs` / `test` / `style` / `perf` / `revert`。

```text
feat(projects): 新增项目工作台自动保存提示
fix(auth): 修复刷新令牌过期后的并发 401
```

提交前会自动执行 `husky` + `lint-staged`（ESLint 自动修复 + Prettier 格式化），`commit-msg` 钩子会拒绝不合规信息。

## 脚本

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 开发服务器 |
| `npm run build` | 生产构建 |
| `npm run lint` | ESLint 校验 |
| `npm run typecheck` | TypeScript 类型检查 |
| `npm run test` | 单元测试（Vitest，含覆盖率报告） |
| `npm run test:e2e` | E2E 测试（Playwright） |
| `npm run prepare` | 安装 husky 钩子 |

## CI 四门禁

`.github/workflows/ci.yml` 串联 `lint` → `typecheck` → `test(含 coverage)` → `build`，任一失败阻断合并，并上传 coverage 产物。

## 测试

- **单元测试**：`src/**/*.test.ts(x)`，覆盖纯函数、zod 契约、API client、关键 UI 组件。
- **覆盖率**：`vitest` + `v8`，阈值渐进提升（当前软提示，目标 80%）。
- **E2E**：`e2e/*.spec.ts` 覆盖注册/登录/登出、建项目/进工作台等核心流，依赖 dev mock，无需真实后端。

## 可观测性

- 上报层 `src/lib/monitoring/`：生产环境有 DSN 走 Sentry 兼容接口，否则降级为 localStorage 环形缓冲。
- 组件级 `ErrorBoundary` 兜底子树渲染异常；`app/error.tsx` 与 `app/global-error.tsx` 已接入上报。

## 目录结构（Feature-Sliced 摘要）

```
src/
  app/            # Next.js 路由与布局、全局错误页
  features/       # 业务域（projects/characters/workflow/manuscript/settings…）
  shared/         # 跨业务通用组件、ui 原子件、lib、config
  lib/            # 基础设施：api client、monitoring、validation、stores、mocks
text-forge/docs/  # 后端契约（seed-api-contract.md）
docs/adr/         # 架构决策记录（ADR）
```

## 协作治理

- `.github/CODEOWNERS`：按 features 模块划分负责人。
- `docs/adr/`：已落地架构决策的 ADR（FSA / Git 门禁 / 可观测性）。
- Storybook：本期列为 **P2 暂缓**，后续补齐组件文档与可视化测试。

## 后端对接边界（先前端后后端，后端只对接）

- **契约事实源**：`openapi/seed-api.yaml`（OpenAPI 3.1）覆盖 `/api/projects`、`/api/characters`、`/api/generate/*`、`/api/workflow` 等已用端点。
- **类型生成**：`npm run typegen` 由契约生成 `src/types/generated.ts`；CI 通过 `typegen:check` 校验「契约 → 类型」不脱节（漂移则失败）。
- **响应校验**：关键端点响应经 `src/lib/validation/responses.ts` 的 zod schema 安全解析，防后端脏数据导致前端白屏。
- **Zero-后端可运行**：dev 期 `NEXT_PUBLIC_API_URL=''` 全走 `src/mocks/`；CI 的 e2e 同样跑 mock 模式，不依赖后端存活。
- **对接决策**：详见 `docs/adr/0004-backend-integration-boundary.md`（前端注入点 + 后端需实现端点清单）。

## 了解更多

- [Next.js 文档](https://nextjs.org/docs)
- [Feature-Sliced Design](https://feature-sliced.design/)
