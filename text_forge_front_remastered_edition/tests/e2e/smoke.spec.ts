// tests/e2e/smoke.spec.ts
// E2E 真实链路冒烟：公开页面 + 注册流程 + 登录后建书/初始化器/Agent（登录后需要已验证账号）
import { test, expect } from '@playwright/test';

const E2E_EMAIL = process.env.E2E_EMAIL || '';
const E2E_PASSWORD = process.env.E2E_PASSWORD || 'test123456';

test.describe('公开页面冒烟', () => {
  test('登录页可达', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByPlaceholder('your@email.com')).toBeVisible();
  });

  test('注册流程可达（提交后跳转邮箱验证页）', async ({ page }) => {
    const suffix = Date.now();
    await page.goto('/register');
    await page.getByPlaceholder('你的昵称').fill(`e2e_${suffix}`);
    await page.getByPlaceholder('your@email.com').fill(`e2e_${suffix}@example.com`);
    await page.getByPlaceholder('至少6位').fill(E2E_PASSWORD);
    await page.getByPlaceholder('再次输入密码').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: /注\s*册/ }).click();
    // 注册成功 → 跳转邮箱验证页
    await expect(page).toHaveURL(/verify-email/, { timeout: 15_000 });
  });
});

test.describe('登录后真实链路（需 E2E_EMAIL 提供已验证账号）', () => {
  test.skip(!E2E_EMAIL, '未配置 E2E_EMAIL，跳过登录后链路');

  test('登录 → 建书 → 初始化器空态 → Agent 配置引导', async ({ page }) => {
    // ── 登录 ──
    await page.goto('/login');
    await page.getByPlaceholder('your@email.com').fill(E2E_EMAIL);
    await page.getByPlaceholder('输入密码').fill(E2E_PASSWORD);
    await page.getByRole('button', { name: /登\s*录/ }).click();
    await expect(page).toHaveURL(/\/books/, { timeout: 20_000 });

    // ── 建书 ──
    await page.getByRole('button', { name: /新\s*建/ }).click();
    const title = `E2E测试书_${Date.now()}`;
    await page.getByPlaceholder('请输入书名').fill(title);
    await page.getByRole('button', { name: /保\s*存/ }).click();
    // 列表出现新书（且弹窗已关闭——否则 getByText 会匹配弹窗 input 的 value）
    await expect(page.getByPlaceholder('请输入书名')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });

    // ── 进入书籍详情 ──
    await page.locator('a', { hasText: title }).first().click();
    await expect(page).toHaveURL(/\/books\/\d+/, { timeout: 15_000 });

    // ── Agent 面板：新浏览器无模型配置 → 引导条可见 ──
    await page.getByRole('button', { name: /AI\s*助手/ }).first().click();
    await expect(page.getByText('尚未配置模型，AI 助手无法工作')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('link', { name: '去设置' })).toBeVisible();

    // ── 初始化器（先关 Agent 面板，避免相互遮挡）──
    await page.getByRole('button', { name: /打开初始化器|初始化器/ }).first().click();
    // 初始化器面板打开：步骤 0 创意设定表单可见
    await expect(page.getByText('创作设定')).toBeVisible();
    await expect(page.getByPlaceholder('史诗奇幻、轻松幽默、黑暗残酷...')).toBeVisible();
    // 步骤 0 无 AI 生成的候选卡片（不再有硬编码假数据）
    await expect(page.getByText('星辰纪元')).toHaveCount(0);

    // 前进到步骤 1（地点）：空态引导可见，提示点击"AI 生成候选"
    await page.getByRole('button', { name: /下\s*一步/ }).click();
    await expect(page.getByText('还没有候选内容')).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /AI 生成候选/ })).toBeVisible();
  });
});
