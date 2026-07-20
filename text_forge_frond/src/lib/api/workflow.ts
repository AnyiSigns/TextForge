// src/lib/api/workflow.ts
// 多 Agent 工作流 —— 前端接口层（后端未就绪时走 mock）。
//
// 设计要点（供后端对接）：
// - 工作流 = 有向无环图（DAG）。节点 node.kind 决定角色：
//     'input'  用户输入/项目上下文入口
//     'agent'  LLM 节点（带 modelId + systemPrompt，可挂 toolIds）
//     'tool'   工具调用节点（如 RAG 检索、网络搜索）
//     'output' 汇总输出
// - 节点通过 dependsOn / edges 表达依赖；运行时按拓扑序执行，
//   上游节点的文本输出会注入下游节点的上下文（context 拼接）。
// - 这与你「AI 生成当前章节标题 → 模型会话提炼压缩」完全对应：
//   两个 agent 节点线性串联即可。
//
// 后端契约：
//   GET    /api/workflows
//   POST   /api/workflows
//   GET    /api/workflows/:id
//   PUT    /api/workflows/:id
//   DELETE /api/workflows/:id
//   POST   /api/workflows/:id/run   body: { input: string }  -> SSE 流式返回步骤
//
// 本文件为聚合层，具体实现见：
//   workflowTypes.ts     类型定义
//   workflowStorage.ts   本地持久化 + 示例/内置流水线 + 列表/增删
//   workflowRunner.ts    运行引擎（拓扑执行/RAG/tier 路由）
//   workflowConverters.ts 运行结果 → 项目步骤 / 使用统计

export * from './workflowTypes';
export * from './workflowStorage';
export * from './workflowRunner';
export * from './workflowConverters';

export type { RunWorkflowOptions } from './workflowTypes';
