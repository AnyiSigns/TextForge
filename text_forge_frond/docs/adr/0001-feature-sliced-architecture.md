# 0001 - Feature-Sliced 架构

- 状态：已落地（Accepted）
- 日期：2026-07

## 背景

前端随功能增长（项目 / 角色 / 工作流 / 手稿 / 设置）趋于复杂，按类型堆砌的目录难以定位与边界隔离，跨模块耦合导致改动风险高。

## 决策

采用 Feature-Sliced 分层：

- `src/features/*`：按业务域组织（projects / characters / workflow / manuscript / settings），域私有 ui / api / hooks 不跨域泄漏。
- `src/shared/*`：跨域共享件（components / ui / lib / config / layout），不依赖具体业务。
- `src/lib/*`：全局基础设施（stores / monitoring / validation / hooks / seed）。
- 全局跨业务状态（projectStore / briefStore）留在 `lib/stores`，不强行迁入 features（约 30+ 引用点，迁入收益低、风险高）。

## 后果

- 正向：模块边界清晰，新功能可独立落地；组件测试可针对单 feature 编写。
- 负向：部分历史组件仍在 `src/components` 与 features 之间需后续迁移；shared 与 features 的依赖方向需通过 lint 约束巩固。
