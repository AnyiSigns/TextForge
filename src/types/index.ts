// src/types/index.ts
//
// 类型 barrel：仅 re-export 各域类型，不再内联定义。
// 各域文件见 ./project ./character ./brief ./workflow ./model
//           ./knowledge ./manuscript ./seed ./chat ./common
//
// 约定（勿删）：部分导出为「后端契约预留层」（API 请求/响应体、媒体任务、
// 同步实体等），当前前端源码零引用，但属于与后端约定的活跃契约，保留不删，
// 待后端就绪时直接接入，切勿轻易移除或标 @deprecated。

export * from './common';
export * from './model';
export * from './project';
export * from './character';
export * from './brief';
export * from './workflow';
export * from './knowledge';
export * from './manuscript';
export * from './seed';
export * from './chat';
