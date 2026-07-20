// src/lib/api/index.ts
// 业务 API 统一出口（契约层：openapi/seed-api.yaml -> src/types/generated.ts）。
// 各域按模块组织：projects / characters / workflow / generation。
export * from './projects';
export * from './characters';
export * from './workflow';
export * from './generation';
