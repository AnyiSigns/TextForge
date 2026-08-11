#!/usr/bin/env node
/**
 * 阶段 4（大厂标准化）：OpenAPI → TS 类型生成。
 *
 * 从后端 /openapi.json 中筛出 agent 相关三组路径（/agent、/agent-memories、/workflows），
 * 用 openapi-typescript 生成 src/shared/api/gen-agent-types.ts。
 *
 * 用法：
 *   npm run gen:agent-types            # 默认后端 http://127.0.0.1:8000
 *   OPENAPI_URL=http://x:8000 npm run gen:agent-types
 *
 * 后端未启动时给出提示并退出（手写类型保留，不影响编译）。
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const OUT_FILE = join(ROOT, 'src', 'shared', 'api', 'gen-agent-types.ts');

const OPENAPI_URL = process.env.OPENAPI_URL || 'http://127.0.0.1:8000';
const TARGET_PREFIXES = ['/agent', '/agent-memories', '/workflows'];

let res;
try {
  res = await fetch(`${OPENAPI_URL}/openapi.json`);
} catch (e) {
  console.error(`[gen-agent-types] 无法连接 ${OPENAPI_URL}/openapi.json（${e.message}）。`);
  console.error('请先启动后端（uvicorn）后重试；未生成文件时前端仍使用手写类型。');
  process.exit(1);
}
if (!res.ok) {
  console.error(`[gen-agent-types] 无法获取 ${OPENAPI_URL}/openapi.json（status=${res.status}）。`);
  console.error('请先启动后端（uvicorn）后重试；未生成文件时前端仍使用手写类型。');
  process.exit(1);
}

const schema = await res.json();

// 仅保留目标路径及其引用的 schema 组件（components.schemas 全量保留，精简更省事且安全）
const paths = {};
for (const [pathKey, value] of Object.entries(schema.paths || {})) {
  if (TARGET_PREFIXES.some((p) => pathKey.startsWith(p))) {
    paths[pathKey] = value;
  }
}
if (Object.keys(paths).length === 0) {
  console.error('[gen-agent-types] 目标路径为空，请检查后端路由前缀。');
  process.exit(1);
}

const filteredSchema = { ...schema, paths };

// openapi-typescript 支持从文件/URL 输入；这里写入临时文件避免 stdin 兼容问题
const tmp = join(ROOT, 'node_modules', '.cache', 'gen-agent-types.openapi.json');
mkdirSync(dirname(tmp), { recursive: true });
writeFileSync(tmp, JSON.stringify(filteredSchema));

const argv = [tmp, '-o', OUT_FILE];
if (process.env.GEN_TYPES_EXPORT) argv.push('--export-type');
execFileSync('npx', ['openapi-typescript', ...argv], { cwd: ROOT, stdio: 'inherit' });

console.log(`[gen-agent-types] 已生成 ${OUT_FILE}`);
console.log(`[gen-agent-types] 覆盖路径：${Object.keys(paths).join(', ')}`);
