import { test, expect, type APIRequestContext } from '@playwright/test';

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

let authToken: string | null = null;
let createdProjectId: string | null = null;
let createdCharacterId: string | null = null;
let createdApiKeyId: string | null = null;

type Step = { id: string; agent: string; content: string; status: string };

const memory = {
  users: [{ id: 'u1', username: 'testuser', email: 'test@example.com', password: '123456', avatar: '', isVerified: true, createdAt: new Date().toISOString() }],
  projects: [] as Array<{ id: string; title: string; description: string; genre: string; status: string; createdAt: string; updatedAt: string; steps: Step[] }>,
  characters: [] as Array<{ id: string; name: string; description: string; avatar?: string; novelId?: string; createdAt: string }>,
  apiKeys: [] as Array<{ id: string; name: string; key: string; createdAt: string; lastUsed: string | null }>,
};

function genId() { return Math.random().toString(36).slice(2, 10); }

async function login(page: any) {
  await page.goto('/login');
  await page.fill('#email', 'test@example.com');
  await page.fill('#password', '123456');
  await page.click('button[type="submit"]');
  await page.waitForURL('/');
}

function setupRoutes(page: any) {
  page.route(`${API}/api/**`, async (route: any) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const method = route.request().method();
    const authHeader = route.request().headers()['authorization'] as string | undefined;

    const res = (status: number, body: any) => route.fulfill({ status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const json = async () => route.request().postDataJSON();

    try {
      if (pathname === '/api/auth/login' && method === 'POST') {
        const body = await json();
        const user = memory.users.find(u => u.email === body.email && u.password === body.password);
        if (!user) return res(401, { message: '邮箱或密码错误' });
        const token = `mock-token-${user.id}`;
        return res(200, { access_token: token, refresh_token: 'mock-refresh', user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar, isVerified: user.isVerified, createdAt: user.createdAt } });
      }

      if (pathname === '/api/auth/refresh' && method === 'POST') {
        return res(200, { access_token: 'mock-token-refreshed' });
      }

      if (pathname === '/api/auth/register' && method === 'POST') {
        const body = await json();
        if (memory.users.find(u => u.email === body.email)) return res(400, { message: '邮箱已被注册' });
        const user = { id: genId(), username: body.username, email: body.email, password: body.password, avatar: '', isVerified: false, createdAt: new Date().toISOString() };
        memory.users.push(user);
        return res(200, { message: '验证邮件已发送', email: body.email });
      }

      if (pathname === '/api/auth/send-verify-code' && method === 'POST') {
        return res(200, { message: '验证码已发送' });
      }

      if (pathname === '/api/projects' && method === 'GET') {
        return res(200, { projects: memory.projects.map(p => ({ id: p.id, title: p.title, status: p.status, createdAt: p.createdAt, updatedAt: p.updatedAt })) });
      }

      if (pathname === '/api/projects' && method === 'POST') {
        const body = await json();
        const project = { id: genId(), title: body.title, description: body.description || '', genre: body.genre || '科幻', status: 'draft', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), steps: [] };
        memory.projects.push(project);
        return res(200, { project });
      }

      const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
      if (projectMatch) {
        const pid = projectMatch[1];
        const project = memory.projects.find(p => p.id === pid);
        if (!project) return res(404, { message: '项目不存在' });
        if (method === 'GET') return res(200, { steps: project.steps });
        if (method === 'DELETE') { memory.projects = memory.projects.filter(p => p.id !== pid); return res(200, {}); }
      }

      const projectGenerateMatch = pathname.match(/^\/api\/projects\/([^/]+)\/generate$/);
      if (projectGenerateMatch && method === 'POST') {
        const pid = projectGenerateMatch[1];
        const project = memory.projects.find(p => p.id === pid);
        if (!project) return res(404, { message: '项目不存在' });

        const events = [
          { type: 'agent_switch', agent: 'world-builder', content: '' },
          { type: 'chunk', content: '构建世界中...' },
          { type: 'step_complete' },
          { type: 'agent_switch', agent: 'character-designer', content: '' },
          { type: 'chunk', content: '设计角色中...' },
          { type: 'step_complete' },
          { type: 'done' },
        ];
        const sseBody = events.map(e => `data: ${JSON.stringify(e)}\n\n`).join('');
        return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: sseBody });
      }

      const confirmMatch = pathname.match(/^\/api\/projects\/([^/]+)\/confirm$/);
      if (confirmMatch && method === 'POST') {
        const body = await json();
        const pid = confirmMatch[1];
        const project = memory.projects.find(p => p.id === pid);
        if (project && body.step_id) { const step = project.steps.find(s => s.id === body.step_id); if (step) step.status = 'completed'; }
        return res(200, {});
      }

      const stepEditMatch = pathname.match(/^\/api\/projects\/([^/]+)\/steps\/([^/]+)$/);
      if (stepEditMatch && method === 'PUT') {
        const body = await json();
        const pid = stepEditMatch[1];
        const sid = stepEditMatch[2];
        const project = memory.projects.find(p => p.id === pid);
        if (project) { const step = project.steps.find(s => s.id === sid); if (step) { step.content = body.content; step.status = 'completed'; } }
        return res(200, {});
      }

      if (pathname === '/api/characters' && method === 'GET') {
        return res(200, { characters: memory.characters });
      }

      if (pathname === '/api/characters' && method === 'POST') {
        const body = await json();
        const character = { id: genId(), name: body.name, description: body.description, avatar: '', createdAt: new Date().toISOString() };
        memory.characters.push(character);
        return res(200, { character });
      }

      const charMatch = pathname.match(/^\/api\/characters\/([^/]+)$/);
      if (charMatch) {
        const cid = charMatch[1];
        const character = memory.characters.find(c => c.id === cid);
        if (!character) return res(404, { message: '角色不存在' });
        if (method === 'GET') return res(200, character);
        if (method === 'DELETE') { memory.characters = memory.characters.filter(c => c.id !== cid); return res(200, {}); }
      }

      if (pathname.match(/^\/api\/characters\/[^/]+\/messages$/) && method === 'GET') return res(200, { messages: [] });

      const charChatMatch = pathname.match(/^\/api\/characters\/([^/]+)\/chat$/);
      if (charChatMatch && method === 'POST') {
        return res(200, { message: { id: genId(), role: 'assistant', content: '你好！我是你的AI助手。', timestamp: new Date().toISOString() } });
      }

      if (pathname === '/api/api-keys' && method === 'GET') return res(200, { keys: memory.apiKeys });
      if (pathname === '/api/api-keys' && method === 'POST') {
        const body = await json();
        const apiKey = { id: genId(), name: body.name, key: `sk-${genId()}${genId()}`, createdAt: new Date().toISOString(), lastUsed: null };
        memory.apiKeys.push(apiKey);
        return res(200, { key: apiKey });
      }

      const apiKeyMatch = pathname.match(/^\/api\/api-keys\/([^/]+)$/);
      if (apiKeyMatch && method === 'DELETE') { memory.apiKeys = memory.apiKeys.filter(k => k.id !== apiKeyMatch[1]); return res(200, {}); }

      if (pathname === '/api/user/profile' && method === 'PUT') {
        const body = await json();
        const user = memory.users[0];
        Object.assign(user, body);
        return res(200, { user });
      }

      if (pathname === '/api/user/change-password' && method === 'POST') return res(200, {});
      if (pathname === '/api/user/change-password-by-email' && method === 'POST') return res(200, {});
      if (pathname === '/api/user/avatar' && method === 'POST') return res(200, { avatar_url: 'https://example.com/avatar.png' });

      return res(404, { message: 'Not Found' });
    } catch (e) {
      return res(500, { message: 'Mock error', details: String(e) });
    }
  });
}

test.describe.configure({ mode: 'serial' });

test.describe('基础页面与认证', () => {
  test('登录页显示正常', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('欢迎回来')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toContainText('登录');
    await expect(page.getByText('立即注册')).toBeVisible();
  });

  test('空提交显示验证', async ({ page }) => {
    await page.goto('/login');
    await page.click('button[type="submit"]');
    await expect(page.locator('#email')).toHaveAttribute('required', '');
  });

  test('密码可见切换', async ({ page }) => {
    await page.goto('/login');
    const pwd = page.locator('#password');
    await pwd.fill('mysecret');
    await expect(pwd).toHaveAttribute('type', 'password');
    await page.locator('#password').locator('..').locator('button').click();
    await expect(pwd).toHaveAttribute('type', 'text');
    await page.locator('#password').locator('..').locator('button').click();
    await expect(pwd).toHaveAttribute('type', 'password');
  });

  test('跳转注册页', async ({ page }) => {
    await page.goto('/login');
    await page.getByRole('link', { name: '立即注册' }).click();
    await page.waitForURL(/\/zh\/register/, { timeout: 10000 });
  });

  test('注册页显示正常', async ({ page }) => {
    await page.goto('/register');
    await expect(page.getByText('创建账号')).toBeVisible();
    await expect(page.locator('#username')).toBeVisible();
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('#confirmPassword')).toBeVisible();
  });

  test('密码不一致校验', async ({ page }) => {
    await page.goto('/register');
    await page.fill('#username', 'testuser');
    await page.fill('#email', 'test@example.com');
    await page.fill('#password', '123456');
    await page.fill('#confirmPassword', '654321');
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/\/zh\/register/);
    await expect(page.locator('#confirmPassword')).toHaveValue('654321');
  });

  test('未登录受保护页面重定向到登录页', async ({ page }) => {
    const routes = ['/', '/projects', '/projects/new', '/characters', '/characters/create', '/settings', '/knowledge', '/tasks', '/assets', '/api-keys'];
    await page.context().clearCookies();
    for (const route of routes) {
      await page.goto(route);
      await expect(page).toHaveURL(/\/zh\/login/);
      await expect(page.getByText('欢迎回来')).toBeVisible();
    }
  });

  test('验证邮箱页无需登录', async ({ page }) => {
    await page.goto('/verify-email');
    await expect(page).not.toHaveURL(/\/zh\/login/);
  });

  test('404 页面', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist');
    expect(response?.status()).toBe(404);
  });
});

test.describe('登录与项目管理', () => {
  test.beforeEach(async ({ page }) => {
    setupRoutes(page);
    await login(page);
  });

  test('仪表盘显示', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('仪表盘');
  });

  test('项目列表加载', async ({ page }) => {
    await page.goto('/projects');
    await expect(page.locator('h1')).toContainText('项目管理');
  });

  test('创建新项目', async ({ page }) => {
    await page.goto('/projects/new');
    await page.fill('#title', 'E2E测试项目');
    await page.selectOption('#genre', '科幻');
    await page.fill('#description', '这是一个浏览器测试项目');
    await page.click('button[type="submit"]');
    await page.waitForURL((url) => url.pathname.startsWith('/projects/') && !url.pathname.includes('/projects/new'));
    createdProjectId = await page.evaluate(() => window.location.pathname.split('/').pop() || null);
  });

  test('项目详情与生成', async ({ page }) => {
    if (!createdProjectId) { test.skip(true, '无测试项目'); return; }
    const consoleLogs: string[] = [];
    page.on('console', msg => consoleLogs.push(`[${msg.type()}] ${msg.text()}`));

    await page.goto(`/projects/${createdProjectId}`);
    await page.waitForTimeout(2000);
    await expect(page.getByText('还没有内容')).toBeVisible();

    const generateRequest = page.waitForRequest('**/api/projects/*/generate');
    await page.click('button:has-text("开始生成")');
    await generateRequest;
    await page.waitForTimeout(5000);

    console.log('Console logs during generation:', consoleLogs);
    await expect(page.getByText('构建世界中...')).toBeVisible();
  });

  test('删除测试项目', async ({ page }) => {
    if (!createdProjectId) { test.skip(true, '无测试项目'); return; }
    await page.goto('/projects');
    await page.once('dialog', (d: any) => d.accept());
    const card = page.locator(`a[href="/projects/${createdProjectId}"]`).locator('xpath=ancestor::*[@data-slot="card"]');
    await card.locator('button:has(.lucide-trash-2)').click();
    await page.waitForTimeout(300);
    await expect(page.getByText('E2E测试项目')).toHaveCount(0);
    createdProjectId = null;
  });
});

test.describe('角色管理', () => {
  test.beforeEach(async ({ page }) => {
    setupRoutes(page);
    await login(page);
  });

  test('角色列表加载', async ({ page }) => {
    await page.goto('/characters');
    await expect(page.locator('h1')).toContainText('角色模拟');
  });

  test('创建新角色', async ({ page }) => {
    await page.goto('/characters/create');
    await page.fill('#name', 'E2E测试角色');
    await page.fill('#description', '这是浏览器测试角色');
    await page.click('button[type="submit"]');
    await page.waitForURL('/characters');
    await page.getByText('E2E测试角色').first().waitFor();
    createdCharacterId = await page.evaluate(() => {
      const cards = document.querySelectorAll('[data-slot="card"]');
      for (const card of cards) {
        const title = card.querySelector('[data-slot="card-title"]');
        if (title && title.textContent?.includes('E2E测试角色')) {
          const link = card.querySelector('a[href*="/characters/"]');
          if (link) {
            const href = link.getAttribute('href') || '';
            const parts = href.split('/').filter(Boolean);
            return parts[parts.length - 2] || null;
          }
        }
      }
      return null;
    });
  });

  test('删除测试角色', async ({ page }) => {
    if (!createdCharacterId) { test.skip(true, '无测试角色'); return; }
    await page.goto('/characters');
    await page.once('dialog', (d: any) => d.accept());
    const card = page.locator(`a[href="/characters/${createdCharacterId}/chat"]`).locator('xpath=ancestor::*[@data-slot="card"]');
    await card.locator('button:has(.lucide-trash-2)').click();
    await page.waitForTimeout(300);
    await expect(page.getByText('E2E测试角色')).toHaveCount(0);
    createdCharacterId = null;
  });
});

test.describe('设置与 API Keys', () => {
  test.beforeEach(async ({ page }) => {
    setupRoutes(page);
    await login(page);
  });

  test('设置页面切换 Tab', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.locator('h1')).toContainText('设置');
    await page.click('button:has-text("安全")');
    await expect(page.getByText('修改密码', { exact: true })).toBeVisible();
    await page.click('button:has-text("外观")');
    await expect(page.getByText('主题与背景')).toBeVisible();
  });

  test('生成并删除 API Key', async ({ page }) => {
    await page.goto('/api-keys');
    await expect(page.locator('h1')).toContainText('开放平台');
    await page.fill('#keyName', 'E2E测试Key');
    await page.click('button:has-text("生成")');
    await page.waitForTimeout(500);
    createdApiKeyId = await page.evaluate(() => {
      const rows = document.querySelectorAll('table tbody tr');
      return rows[0]?.querySelector('td')?.getAttribute('data-id') || null;
    });
    if (createdApiKeyId) {
      await page.once('dialog', (d: any) => d.accept());
      await page.locator('table tbody tr').first().locator('button:has(.lucide-trash-2)').click();
      await page.waitForTimeout(500);
      createdApiKeyId = null;
    }
  });
});

test.describe('测试数据清理', () => {
  test('清理残留测试数据与状态', async ({ page }) => {
    setupRoutes(page);
    if (createdProjectId) {
      await page.goto('/projects');
      await page.once('dialog', (d: any) => d.accept());
      const card = page.locator(`a[href="/projects/${createdProjectId}"]`).locator('xpath=ancestor::*[@data-slot="card"]');
      await card.locator('button:has(.lucide-trash-2)').click();
      await page.waitForTimeout(300);
      createdProjectId = null;
    }
    if (createdCharacterId) {
      await page.goto('/characters');
      await page.once('dialog', (d: any) => d.accept());
      const card = page.locator(`a[href="/characters/${createdCharacterId}/chat"]`).locator('xpath=ancestor::*[@data-slot="card"]');
      await card.locator('button:has(.lucide-trash-2)').click();
      await page.waitForTimeout(300);
      createdCharacterId = null;
    }
    if (createdApiKeyId) {
      await page.goto('/api-keys');
      await page.once('dialog', (d: any) => d.accept());
      await page.locator('table tbody tr').first().locator('button:has(.lucide-trash-2)').click();
      await page.waitForTimeout(300);
      createdApiKeyId = null;
    }
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    expect(await page.evaluate(() => localStorage.length)).toBe(0);
    await page.context().clearCookies();
  });
});
