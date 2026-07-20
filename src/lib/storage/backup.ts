// src/lib/storage/backup.ts
// 统一本地存储：把项目级附属文档（大纲、灵感剪藏）也存入 IndexedDB，
// 与 projects/characters/briefs 保持一致，避免 localStorage 与 IndexedDB 两套存储分裂。
// 同时提供整包导出/导入，保证"纯前端可跑 + 前后端数据一致"。
//
// 本文件为聚合层，具体实现见：
//   backupSchema.ts    类型定义 + zod 校验（防篡改导入）
//   backupOutline.ts   大纲 / 灵感 CRUD（IndexedDB）
//   backupWorkspace.ts 整包工作区导出 / 导入 / 下载
//   backupExport.ts    单项目 / 手稿书籍导出（Markdown / JSON / TXT）

export * from './backupSchema';
export * from './backupOutline';
export * from './backupWorkspace';
export * from './backupExport';
