import { test, expect } from '@playwright/test';

// 抑制 Next 16 开发期 devtools 错误浮层（nextjs-portal）对指针事件的拦截，避免其遮挡按钮点击。
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

const BASE = 'http://localhost:3000';
const API = 'http://localhost:8000';

type Char = { id: string; name: string; description: string; avatar?: string; createdAt: string };
type Doc = { id: string; name: string; type: 'file' | 'url'; status: string; createdAt: string };

const store = {
  users: [{ id: 'u1', username: 'testuser', email: 'test@example.com', password: '123456', avatar: '', isVerified: true, createdAt: new Date().toISOString() }],
  characters: [] as Char[],
  documents: [] as Doc[],
};

function genId() { return Math.random().toString(36).slice(2, 10); }

async function login(page: any) {
  await page.goto('/login');
  await page.fill('#email', 'test@example.com');
  await page.fill('#password', '123456');
  await page.click('button[type="submit"]');
  await page.waitForURL((url: URL) => url.pathname.startsWith('/'));
}

function setupRoutes(page: any) {
  page.route(`${API}/api/**`, async (route: any) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const method = route.request().method();
    const res = (status: number, body: any) => route.fulfill({ status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const json = async () => route.request().postDataJSON();

    try {
      if (pathname === '/api/auth/login' && method === 'POST') {
        const body = await json();
        const user = store.users.find(u => u.email === body.email && u.password === body.password);
        if (!user) return res(401, { message: '邮箱或密码错误' });
        return res(200, { access_token: `mock-token-${user.id}`, refresh_token: 'mock-refresh', user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar, isVerified: user.isVerified, createdAt: user.createdAt } });
      }
      if (pathname === '/api/auth/refresh' && method === 'POST') return res(200, { access_token: 'mock-token-refreshed' });

      if (pathname === '/api/characters' && method === 'GET') return res(200, { characters: store.characters });
      if (pathname === '/api/characters' && method === 'POST') {
        const body = await json();
        const character: Char = { id: genId(), name: body.name, description: body.description, avatar: '', createdAt: new Date().toISOString() };
        store.characters.push(character);
        return res(200, { character });
      }
      const charMatch = pathname.match(/^\/api\/characters\/([^/]+)$/);
      if (charMatch) {
        const c = store.characters.find(x => x.id === charMatch[1]);
        if (!c) return res(404, { message: '角色不存在' });
        if (method === 'GET') return res(200, c);
        if (method === 'DELETE') { store.characters = store.characters.filter(x => x.id !== charMatch[1]); return res(200, {}); }
      }
      if (pathname.match(/^\/api\/characters\/[^/]+\/messages$/) && method === 'GET') return res(200, { messages: [] });

      const charChatMatch = pathname.match(/^\/api\/characters\/([^/]+)\/chat$/);
      if (charChatMatch && method === 'POST') {
        const sse = [
          'data: {"content":"你好"}\n\n',
          'data: {"content":"！"}\n\n',
          'data: {"content":"我是你的AI助手。"}\n\n',
          'data: [DONE]\n\n',
        ].join('');
        return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: sse });
      }

      if (pathname === '/api/knowledge/url' && method === 'POST') {
        const body = await json();
        const doc: Doc = { id: genId(), name: body.url, type: 'url', status: 'indexed', createdAt: new Date().toISOString() };
        store.documents.push(doc);
        return res(200, { document: doc });
      }
      if (pathname === '/api/knowledge/upload' && method === 'POST') {
        const doc: Doc = { id: genId(), name: 'uploaded.txt', type: 'file', status: 'indexed', createdAt: new Date().toISOString() };
        store.documents.push(doc);
        return res(200, { document: doc });
      }
      const knowledgeMatch = pathname.match(/^\/api\/knowledge\/([^/]+)$/);
      if (knowledgeMatch && method === 'DELETE') { store.documents = store.documents.filter(d => d.id !== knowledgeMatch[1]); return res(200, {}); }

      if (pathname === '/api/video/generate' && method === 'POST') return res(200, { task_id: genId() });
      if (pathname === '/api/video/tasks' && method === 'GET') return res(200, { tasks: [{ id: genId(), prompt: '测试视频提示词', status: 'completed', progress: 100, result_url: 'https://example.com/video.mp4', createdAt: new Date().toISOString() }] });

      if (pathname === '/api/generate/image' && method === 'POST') return res(200, { image_url: 'https://example.com/img.png' });

      return res(404, { message: 'Not Found' });
    } catch (e) {
      return res(500, { message: 'Mock error', details: String(e) });
    }
  });
}

test.describe('知识库 / AI 视频 / AI 绘画 / 角色对话', () => {
  test.beforeEach(async ({ page }) => {
    setupRoutes(page);
    await login(page);
  });

  test('知识库：加载、添加 URL、删除文档', async ({ page }) => {
    await page.goto('/knowledge');
    await expect(page.locator('h1')).toContainText('知识库');
    await expect(page.getByRole('tab', { name: /个人文档/ })).toBeVisible();

    await page.fill('input[placeholder="输入网页 URL"]', 'https://example.com/doc');
    await page.click('button:has-text("爬取")');
    await expect(page.getByText('https://example.com/doc')).toBeVisible();
    await expect(page.getByText('已索引')).toBeVisible();

    page.once('dialog', (d: any) => d.accept());
    await page.locator('button:has(.lucide-trash-2)').first().click();
    await page.waitForTimeout(400);
    await expect(page.getByText('https://example.com/doc')).toHaveCount(0);
  });

  test('AI 视频：加载并提交任务', async ({ page }) => {
    await page.goto('/tasks');
    await expect(page.locator('h1')).toContainText('AI 视频');
    await page.fill('input[placeholder="描述你想要的视频内容"]', '测试视频提示词');
    await page.click('button:has-text("提交任务")');
    await expect(page.getByText('测试视频提示词')).toBeVisible();
    await expect(page.getByText('完成')).toBeVisible();
    await expect(page.getByText('查看视频')).toBeVisible();
  });

  test('AI 绘画：加载并生成图片', async ({ page }) => {
    await page.goto('/assets');
    await expect(page.locator('h1')).toContainText('AI 绘画');
    await page.fill('input[placeholder*="黑色风衣"]', '一个赛博朋克风格的剑客');
    await page.click('button:has-text("生成图片")');
    await expect(page.getByText('生成成功')).toBeVisible();
  });

  test('角色对话：创建角色并通过流式 SSE 对话', async ({ page }) => {
    await page.goto('/characters/create');
    await page.fill('#name', '对话测试角色');
    await page.fill('#description', '用于测试对话功能');
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/zh\/characters$/);
    await page.getByText('对话测试角色').first().waitFor();

    const charId = await page.evaluate(() => {
      const cards = document.querySelectorAll('[data-slot="card"]');
      for (const card of cards) {
        const title = card.querySelector('[data-slot="card-title"]');
        if (title && title.textContent?.includes('对话测试角色')) {
          const link = card.querySelector('a[href*="/characters/"]');
          const href = link?.getAttribute('href') || '';
          const parts = href.split('/').filter(Boolean);
          return parts[parts.length - 2] || null;
        }
      }
      return null;
    });
    expect(charId).toBeTruthy();

    await page.goto(`/characters/${charId}/chat`);
    await expect(page.getByText('对话测试角色')).toBeVisible();

    await page.fill('input[placeholder*="说点什么"]', '你好，介绍一下自己');
    await page.click('button:has(.lucide-send)');
    await expect(page.getByText('我是你的AI助手。')).toBeVisible();
    await expect(page.getByText('你好，介绍一下自己')).toBeVisible();

    await page.goto('/characters');
    await page.once('dialog', (d: any) => d.accept());
    const card = page.locator(`a[href="/characters/${charId}/chat"]`).locator('xpath=ancestor::*[@data-slot="card"]');
    await card.locator('button:has(.lucide-trash-2)').click();
    await page.waitForTimeout(400);
    await expect(page.getByText('对话测试角色')).toHaveCount(0);
  });
});
