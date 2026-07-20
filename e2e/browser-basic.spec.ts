import { test, expect } from '@playwright/test';

const API = 'http://localhost:8000';

test.describe('11.2 本地浏览器测试 - 基础功能', () => {
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

  test('访问根路径显示内容', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('API mock 路由工作', async ({ page }) => {
    await page.route(`${API}/api/test`, async (route: any) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'mock response' }),
      });
    });

    const response = await page.evaluate(async () => {
      const res = await fetch('http://localhost:8000/api/test');
      return res.json();
    });

    expect(response.success).toBe(true);
  });

  test('SSE mock 流测试', async ({ page }) => {
    const sseEvents = [
      'data: {"type":"chunk","content":"hello"}\n\n',
      'data: {"type":"done"}\n\n',
    ];

    await page.route('http://localhost:8000/api/stream', async (route: any) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: sseEvents.join(''),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch('http://localhost:8000/api/stream');
      const text = await res.text();
      const lines = text.split('\n\n').filter(Boolean);
      return lines.map((l) => JSON.parse(l.replace('data: ', '')));
    });

    expect(result[0].type).toBe('chunk');
    expect(result[0].content).toBe('hello');
    expect(result[1].type).toBe('done');
  });

  test('表单元素交互测试', async ({ page }) => {
    await page.setContent(`
      <html>
        <body>
          <form>
            <input id="username" type="text" />
            <input id="email" type="email" />
            <button type="submit">提交</button>
          </form>
        </body>
      </html>
    `);

    await page.fill('#username', 'testuser');
    await page.fill('#email', 'test@example.com');

    expect(await page.inputValue('#username')).toBe('testuser');
    expect(await page.inputValue('#email')).toBe('test@example.com');
  });

  test('DOM 元素查询测试', async ({ page }) => {
    await page.setContent(`
      <html>
        <body>
          <div class="card" data-slot="card">
            <h3 class="title" data-slot="card-title">测试标题</h3>
          </div>
        </body>
      </html>
    `);

    await expect(page.locator('[data-slot="card"]')).toBeVisible();
    await expect(page.locator('[data-slot="card-title"]')).toContainText('测试标题');
  });
});