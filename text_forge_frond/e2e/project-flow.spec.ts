import { test, expect } from '@playwright/test';

// 核心流 E2E：创建项目 → 进入工作台
// 依赖开发期 dev mock（proxy.ts 拦截 /api/*），无需真实后端。
test.describe('核心流 - 项目', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const inject = () => {
        const style = document.createElement('style');
        style.textContent = 'nextjs-portal{display:none!important}';
        (document.head || document.documentElement)?.appendChild(style);
      };
      if (document.documentElement) inject();
      else document.addEventListener('DOMContentLoaded', inject);
    });
  });

  async function login(page: import('@playwright/test').Page) {
    await page.goto('/login');
    const email = page.locator('input[type="email"], input[name="email"], input[autocomplete="email"], input[placeholder*="邮箱"], input[placeholder*="用户名"]').first();
    const password = page.locator('input[type="password"]').first();
    await email.fill('demo@textforge.dev');
    await password.fill('password123');
    await password.press('Enter');
    await expect(page).toHaveURL(/^\/(dashboard|projects|workflow|assets|characters|manuscript|tasks)?$/, { timeout: 8000 });
  }

  test('项目列表页可访问', async ({ page }) => {
    await login(page);
    await page.goto('/projects');
    await expect(page.locator('body')).toBeVisible();
  });

  test('新建项目并进入工作台', async ({ page }) => {
    await login(page);
    await page.goto('/projects');

    // 优先走「新建项目」入口（按钮/链接文本兼容中英文与图标）
    const createBtn = page.getByRole('button', { name: /新建|创建|new project|create/i }).first();
    await expect(createBtn).toBeVisible({ timeout: 8000 });
    await createBtn.click();

    // 创建表单：填写标题后提交
    const titleInput = page.locator('input[type="text"], input[name="title"], input[placeholder*="标题"], input[placeholder*="项目名"]').first();
    await expect(titleInput).toBeVisible({ timeout: 8000 });
    await titleInput.fill(`E2E 项目 ${Date.now()}`);

    const submit = page.getByRole('button', { name: /创建|保存|提交|确定|create|save/i }).first();
    await submit.click();

    // 提交后应进入项目工作台（路由形如 /projects/[id]）
    await expect(page).toHaveURL(/\/projects\/.+/, { timeout: 8000 });
    await expect(page.locator('body')).toBeVisible();
  });
});
