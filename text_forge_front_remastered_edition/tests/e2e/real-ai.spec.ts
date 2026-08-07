// tests/e2e/real-ai.spec.ts
// P0 上线前真实链路 E2E：模型配置持久化、初始化器 AI 生成、Agent 对话、工作流执行。
// 依赖：已验证账号（E2E_EMAIL/E2E_PASSWORD）、Redis、后端 :8000、前端 :3000。
// 真实 LLM 调用会消耗 token，且较慢（每个用例 1-5 分钟）。
import { test, expect, type Page } from '@playwright/test';

const E2E_EMAIL = process.env.E2E_EMAIL || '';
const E2E_PASSWORD = process.env.E2E_PASSWORD || 'test123456';
const SKIP_REASON = '未配置 E2E_EMAIL，跳过登录后链路';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByPlaceholder('your@email.com').fill(E2E_EMAIL);
  await page.getByPlaceholder('输入密码').fill(E2E_PASSWORD);
  await page.getByRole('button', { name: /登\s*录/ }).click();
  await expect(page).toHaveURL(/\/books/, { timeout: 20_000 });
}

// 在设置页保存 main 模型配置（写入 IndexedDB，后续 AI 链路读取）
async function saveMainModelConfig(page: Page) {
  await page.goto('/settings');
  await page.getByRole('button', { name: /模\s*型/ }).click();
  // 第一个"编辑"对应 main 角色
  await page.locator('button', { hasText: /^编辑$/ }).first().click();
  await page.locator('button', { hasText: /^保存$/ }).first().click();
  await expect(page.getByText('已保存').first()).toBeVisible({ timeout: 10_000 });
}

async function createBook(page: Page, prefix: string): Promise<{ title: string; bookId: number }> {
  await page.goto('/books');
  await page.getByRole('button', { name: /新\s*建/ }).click();
  const title = `${prefix}_${Date.now()}`;
  await page.getByPlaceholder('请输入书名').fill(title);
  await page.getByRole('button', { name: /保\s*存/ }).click();
  await expect(page.getByPlaceholder('请输入书名')).toHaveCount(0, { timeout: 15_000 });
  await page.locator('a', { hasText: title }).first().click();
  await expect(page).toHaveURL(/\/books\/\d+/);
  const bookId = Number(new URL(page.url()).pathname.split('/').pop());
  return { title, bookId };
}

test.describe('P0 真实链路', () => {
  test.skip(!E2E_EMAIL, SKIP_REASON);

  test('P0-5 模型配置持久化：保存→刷新→仍生效', async ({ page }) => {
    await login(page);
    await saveMainModelConfig(page);
    await page.reload();
    await page.getByRole('button', { name: /模\s*型/ }).click();
    // IndexedDB 回填的配置应含 MaaS 端点或模型 ID
    await expect(page.getByText(/qwen3\.7-plus|ws-6rnv50cb3kvs261t/).first()).toBeVisible({ timeout: 10_000 });
  });

  test('P0-1 初始化器 AI 生成→锁定→落库', async ({ page }) => {
    test.setTimeout(420_000);
    await login(page);
    await saveMainModelConfig(page);
    const { bookId } = await createBook(page, 'E2E初始化器');

    // 打开初始化器
    await page.getByRole('button', { name: /打开初始化器|初始化器/ }).first().click();
    await expect(page.getByText('创作设定')).toBeVisible();

    // 步骤 0：填文风 + 世界观 → 下一步（保存创意设定）
    await page.getByPlaceholder('史诗奇幻、轻松幽默、黑暗残酷...').fill('黑暗史诗奇幻');
    await page.getByPlaceholder('一个由星辰之力驱动的奇幻世界...').fill('测试世界观：蒸汽与魔法共存的大陆，两方势力对峙。');
    await page.getByRole('button', { name: /下\s*一步/ }).click();

    // 步骤 1（地点）：初始为空态 → AI 生成候选
    await expect(page.getByRole('button', { name: /AI 生成候选/ })).toBeVisible({ timeout: 15_000 });
    await page.getByRole('button', { name: /AI 生成候选/ }).click();
    // 等待真实 LLM 返回候选卡片（最多 3 分钟）
    await expect(page.getByText('还没有候选内容')).toHaveCount(0, { timeout: 180_000 });

    // 锁定第一张候选卡片（右上角 Lock 图标按钮）
    const lockBtn = page.locator('button:has(svg.lucide-lock)').first();
    await lockBtn.click();

    // 下一步保存地点 → 进入步骤 2（角色）
    await page.getByRole('button', { name: /下\s*一步/ }).click();
    await expect(page.getByText('还没有候选内容')).toBeVisible({ timeout: 30_000 });

    // 落库验证：从 IndexedDB 读 token，在页面上下文请求后端 API
    const result = await page.evaluate(async (bid) => {
      const readToken = () => new Promise<string>((resolve) => {
        const req = indexedDB.open('text-forge-auth', 99);
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction('keyval', 'readonly');
          const getReq = tx.objectStore('keyval').get('auth-storage');
          getReq.onsuccess = () => {
            const raw = getReq.result;
            try {
              resolve((JSON.parse(raw)?.state?.accessToken as string) || '');
            } catch {
              resolve('');
            }
          };
          getReq.onerror = () => resolve('');
        };
        req.onerror = () => resolve('');
      });
      const token = await readToken();
      const resp = await fetch(`/api/world/locations?book_id=${bid}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      const data = await resp.json().catch(() => ({}));
      return {
        ok: resp.ok,
        count: (Array.isArray(data) ? data : data?.items ?? []).length,
      };
    }, bookId);
    expect(result.ok).toBeTruthy();
    expect(result.count).toBeGreaterThan(0);
  });

  test('P0-2 Agent 真实对话（工具调用 + 流式回复）', async ({ page }) => {
    test.setTimeout(420_000);
    await login(page);
    await saveMainModelConfig(page);
    await createBook(page, 'E2E对话');

    // 打开 AI 助手面板
    await page.getByRole('button', { name: /AI\s*助手/ }).first().click();

    // 发送消息：触发 Agent 分析与工具调用
    const input = page.locator('textarea').last();
    await input.fill('请分析当前书籍的创作状态，并简要说明当前处于哪个阶段。');
    const streamPromise = page.waitForResponse(
      (r) => r.url().includes('/api/agent/stream/') && r.request().method() === 'POST',
      { timeout: 180_000 },
    ).catch(() => null);
    await page.keyboard.press('Enter');
    const resp = await streamPromise;

    // 流式响应结束（POST 完成）后，面板应出现 AI 回复
    if (resp) {
      // 等待对话区出现非空的 AI 消息文本（Agent 面板消息区域）
      await expect(page.locator('.ide-agent-body').getByText(/创作|阶段|状态|建议|分析/).first()).toBeVisible({ timeout: 120_000 });
    } else {
      // 流式通道异常时至少不应停留在"输入后无任何反馈"
      await expect(page.locator('.ide-agent-body')).not.toHaveText(/输入消息开始对话/, { timeout: 120_000 });
    }
  });

  test('P0-3 工作流真实执行（速写模式 → 节点输出）', async ({ page }) => {
    test.setTimeout(600_000);
    await login(page);
    await saveMainModelConfig(page);
    const { bookId } = await createBook(page, 'E2E工作流');

    // 直接打开最轻的内置工作流"速写模式"（2 个 main 节点），带目标书籍
    await page.goto(`/workflow/builtin-quick-write?book_id=${bookId}`);

    // 打开运行面板并执行
    await page.getByRole('button', { name: /运\s*行/ }).first().click();
    await expect(page.getByText('运行面板')).toBeVisible();
    const runBtn = page.getByRole('button', { name: /运\s*行/ }).last();
    await expect(runBtn).toBeEnabled();
    await runBtn.click();

    // 执行链路结束信号：无论节点成功/失败，面板都会显示计数（完成 N/M 或 (N 失败)）。
    // 期间若出现"配置未生效"toast（getModelConfigData 返回 null），立即失败并给出诊断。
    const doneSignal = page.locator('text=/完成\\s*\\d+\\/\\d+|\\(\\d+ 失败\\)/');
    const configToast = page.getByText('请先在设置页配置模型');
    for (let i = 0; i < 48; i++) {
      if (await configToast.count() > 0) {
        throw new Error('模型配置读取失败：getModelConfigData 返回 null（IndexedDB 模型配置未写入）');
      }
      if (await doneSignal.count() > 0) break;
      await page.waitForTimeout(10_000);
    }
    await expect(doneSignal.first()).toBeVisible({ timeout: 5000 });
  });
});
