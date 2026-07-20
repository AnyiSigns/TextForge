// scripts/gen-api-types.mjs
// 由 OpenAPI 契约生成 TS 类型，作为前后端契约事实源的派生产物。
// 运行：npm run gen-api-types
// CI 校验：npm run typegen:check（生成后 git diff 非空即失败）
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const schema = resolve(root, 'openapi/seed-api.yaml');
const out = resolve(root, 'src/types/generated.ts');
const bin = resolve(root, 'node_modules/openapi-typescript/bin/cli.js');

execFileSync(process.execPath, [bin, schema, '--output', out, '--export-type'], {
  stdio: 'inherit',
  cwd: root,
});
