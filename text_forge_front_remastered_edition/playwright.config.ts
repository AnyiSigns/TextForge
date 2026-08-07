import { defineConfig, devices } from '@playwright/test';

/**
 * E2E 真实链路测试配置。
 * webServer 自动拉起：后端 uvicorn(:8000) + 前端 next dev(:3000)。
 * 需要本机 Postgres（默认 localhost:5433）可用。
 *
 * 登录后链路需要已验证账号：通过环境变量提供
 *   E2E_EMAIL / E2E_PASSWORD，未提供时自动跳过。
 */
export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: '..\\.venv\\Scripts\\python.exe -m uvicorn main:app --host 127.0.0.1 --port 8000',
      cwd: '../text_forge_backend',
      url: 'http://127.0.0.1:8000/api/health',
      timeout: 60_000,
      reuseExistingServer: true,
    },
    {
      command: 'pnpm dev',
      url: 'http://localhost:3000',
      timeout: 180_000,
      reuseExistingServer: true,
    },
  ],
});
