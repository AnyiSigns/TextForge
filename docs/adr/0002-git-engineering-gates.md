# 0002 - Git 工程化门禁

- 状态：已落地（Accepted）
- 日期：2026-07

## 背景

提交前无任何自动检查，易把 lint / 类型 / 测试失败带入主分支；提交信息无规范，CHANGELOG 与版本难以追溯。

## 决策

- husky 安装 git hooks（`prepare: husky`）。
- `pre-commit` 跑 lint-staged（ESLint --fix + Prettier 格式化）。
- `commit-msg` 跑 commitlint（@commitlint/config-conventional，类型限定 feat/fix/refactor/chore/docs/test/style/perf/revert）。
- CI 四门禁（lint / typecheck / test+coverage / build）任一失败阻断合并。
- 覆盖率阈值当前为软提示（不硬卡死），随测试扩面逐步收紧至 80%。

## 后果

- 正向：提交质量基线稳定，信息可追溯。
- 负向：首次 clone 需 `npm install` 触发 prepare；Windows 下 PowerShell 写 UTF-8 文件需走 Read+Edit/Write 而非 Set-Content。
