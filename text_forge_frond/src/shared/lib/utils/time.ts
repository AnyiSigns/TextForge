// src/lib/utils/time.ts

/** 当前 ISO 时间戳（统一时间来源，便于测试替换与风格一致） */
export function now(): string {
  return new Date().toISOString();
}
