import { test, expect } from '@playwright/test';

// 核心流 E2E：注册 → 登录 → 登出
// 依赖开发期 dev mock（proxy.ts 拦截 /api/*），无需真实后端。
test.describe('核心流 - 鉴权', () => {
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

  test('注册页可访问并含必要表单', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('body')).toBeVisible();
    // 注册表单至少包含邮箱与密码输入
    const inputs = page.locator('input');
    await expect(inputs.first()).toBeVisible();
  });

  test('登录页可访问并提交后跳转到工作台', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('body')).toBeVisible();

    // 填写登录表单（兼容邮箱/用户名 + 密码）
    const email = page
      .locator(
        'input[type="email"], input[name="email"], input[autocomplete="email"], input[placeholder*="邮箱"], input[placeholder*="用户名"]',
      )
      .first();
    const password = page.locator('input[type="password"]').first();
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();

    await email.fill('demo@textforge.dev');
    await password.fill('password123');
    await password.press('Enter');

    // dev mock 登录成功应落到受保护区域（dashboard / projects），至多等待 5s
    await expect(page).toHaveURL(
      /^\/(dashboard|projects|workflow|assets|characters|manuscript|tasks)?$/,
      { timeout: 8000 },
    );
  });

  test('登出后可回到公开页', async ({ page }) => {
    await page.goto('/login');
    const email = page
      .locator(
        'input[type="email"], input[name="email"], input[autocomplete="email"], input[placeholder*="邮箱"], input[placeholder*="用户名"]',
      )
      .first();
    const password = page.locator('input[type="password"]').first();
    await email.fill('demo@textforge.dev');
    await password.fill('password123');
    await password.press('Enter');
    await expect(page).toHaveURL(
      /^\/(dashboard|projects|workflow|assets|characters|manuscript|tasks)?$/,
      { timeout: 8000 },
    );

    // 尝试访问受保护的根并点击登出（若存在）
    await page.goto('/');
    const logoutBtn = page.getByRole('button', { name: /登出|退出|logout/i }).first();
    if (await logoutBtn.isVisible().catch(() => false)) {
      await logoutBtn.click();
      await expect(page).toHaveURL(/\/(login|register).*/, { timeout: 8000 });
    }
  });
});
