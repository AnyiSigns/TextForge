import { test, expect } from '@playwright/test';

const API = 'http://localhost:8000';

const store = {
  users: [{ id: 'u1', username: 'testuser', email: 'test@example.com', password: '123456', avatar: '', isVerified: true, createdAt: new Date().toISOString() }],
  projects: [] as Array<{ id: string; title: string; description: string; genre: string; status: string; createdAt: string; updatedAt: string; steps: any[] }>,
  characters: [] as Array<{ id: string; name: string; description: string; avatar?: string; createdAt: string }>,
  apiKeys: [] as Array<{ id: string; name: string; key: string; createdAt: string; lastUsed: string | null }>,
  documents: [] as Array<{ id: string; name: string; status: string; createdAt: string }>,
};

function genId() { return Math.random().toString(36).slice(2, 10); }

async function login(page: any) {
  await page.goto('/login');
  await page.fill('#email', 'test@example.com');
  await page.fill('#password', '123456');
  await page.click('button[type="submit"]');
  await page.waitForURL('/');
}

// 离线 Mock：拦截所有 localhost:8000/api/** 请求，无需真实后端
function setupRoutes(page: any) {
  page.route(`${API}/api/**`, async (route: any) => {
    const url = new URL(route.request().url());
    const pathname = url.pathname;
    const method = route.request().method();
    const res = (status: number, body: any) =>
      route.fulfill({ status, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const json = async () => {
      try { return await route.request().postDataJSON(); } catch { return {}; }
    };

    try {
      // ===== 认证 =====
      if (pathname === '/api/auth/login' && method === 'POST') {
        const body = await json();
        const user = store.users.find((u) => u.email === body.email && u.password === body.password);
        if (!user) return res(401, { message: '邮箱或密码错误' });
        return res(200, {
          access_token: `mock-token-${user.id}`, refresh_token: 'mock-refresh',
          user: { id: user.id, username: user.username, email: user.email, avatar: user.avatar, isVerified: user.isVerified, createdAt: user.createdAt },
        });
      }
      if (pathname === '/api/auth/refresh' && method === 'POST') return res(200, { access_token: 'mock-token-refreshed' });
      if (pathname === '/api/auth/register' && method === 'POST') {
        const body = await json();
        if (store.users.find((u) => u.email === body.email)) return res(400, { message: '邮箱已被注册' });
        return res(200, { message: '验证邮件已发送', email: body.email });
      }
      if (pathname === '/api/auth/send-verify-code' && method === 'POST') return res(200, { message: '验证码已发送' });
      if (pathname === '/api/auth/verify-email' && method === 'POST') return res(200, { message: 'ok' });
      if (pathname === '/api/auth/resend-verify' && method === 'POST') return res(200, { message: 'ok' });
      if (pathname === '/api/auth/logout' && method === 'POST') return res(200, {});

      // ===== 项目管理 =====
      if (pathname === '/api/projects' && method === 'GET') {
        return res(200, { projects: store.projects.map((p) => ({ id: p.id, title: p.title, status: p.status, createdAt: p.createdAt, updatedAt: p.updatedAt })) });
      }
      if (pathname === '/api/projects' && method === 'POST') {
        const body = await json();
        const project = { id: genId(), title: body.title, description: body.description || '', genre: body.genre || '科幻', status: 'draft', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), steps: [] };
        store.projects.push(project);
        return res(200, { project });
      }
      const projectMatch = pathname.match(/^\/api\/projects\/([^/]+)$/);
      if (projectMatch) {
        const pid = projectMatch[1];
        const project = store.projects.find((p) => p.id === pid);
        if (!project) return res(404, { message: '项目不存在' });
        if (method === 'GET') return res(200, { steps: project.steps });
        if (method === 'DELETE') { store.projects = store.projects.filter((p) => p.id !== pid); return res(200, {}); }
      }
      const generateMatch = pathname.match(/^\/api\/projects\/([^/]+)\/generate$/);
      if (generateMatch && method === 'POST') {
        const events = [
          { type: 'agent_switch', agent: 'world' },
          { type: 'chunk', content: '世界设定内容……' },
          { type: 'step_complete' },
          { type: 'agent_switch', agent: 'character' },
          { type: 'chunk', content: '角色设定内容……' },
          { type: 'step_complete' },
        ];
        const sse = events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('');
        return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: sse });
      }
      const confirmMatch = pathname.match(/^\/api\/projects\/([^/]+)\/confirm$/);
      if (confirmMatch && method === 'POST') {
        const body = await json();
        const project = store.projects.find((p) => p.id === confirmMatch[1]);
        if (project && body.step_id) { const s = project.steps.find((x) => x.id === body.step_id); if (s) s.status = 'completed'; }
        return res(200, {});
      }
      const stepEditMatch = pathname.match(/^\/api\/projects\/([^/]+)\/steps\/([^/]+)$/);
      if (stepEditMatch && method === 'PUT') {
        const body = await json();
        const project = store.projects.find((p) => p.id === stepEditMatch[1]);
        if (project) { const s = project.steps.find((x) => x.id === stepEditMatch[2]); if (s) { s.content = body.content; s.status = 'completed'; } }
        return res(200, {});
      }

      // ===== 角色 =====
      if (pathname === '/api/characters' && method === 'GET') return res(200, { characters: store.characters });
      if (pathname === '/api/characters' && method === 'POST') {
        const body = await json();
        const character = { id: genId(), name: body.name, description: body.description, avatar: '', createdAt: new Date().toISOString() };
        store.characters.push(character);
        return res(200, { character });
      }
      const charMatch = pathname.match(/^\/api\/characters\/([^/]+)$/);
      if (charMatch) {
        const cid = charMatch[1];
        const character = store.characters.find((c) => c.id === cid);
        if (!character) return res(404, { message: '角色不存在' });
        if (method === 'GET') return res(200, character);
        if (method === 'DELETE') { store.characters = store.characters.filter((c) => c.id !== cid); return res(200, {}); }
      }
      if (pathname.match(/^\/api\/characters\/[^/]+\/messages$/) && method === 'GET') return res(200, { messages: [] });
      const charChatMatch = pathname.match(/^\/api\/characters\/([^/]+)\/chat$/);
      if (charChatMatch && method === 'POST') {
        const threadId = `mock-th-${charChatMatch[1]}-${Date.now()}`;
        const sse = [
          `data: ${JSON.stringify({ type: 'meta', thread_id: threadId })}\n\n`,
          'data: {"content":"你好"}\n\n',
          'data: {"content":"！"}\n\n',
          'data: {"content":"我是你的AI助手。"}\n\n',
          'data: [DONE]\n\n',
        ].join('');
        return route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream' }, body: sse });
      }

      // ===== 知识库 =====
      if (pathname === '/api/knowledge/upload' && method === 'POST') {
        const doc = { id: genId(), name: 'uploaded.txt', status: 'indexed', createdAt: new Date().toISOString() };
        store.documents.push(doc);
        return res(200, { document: doc });
      }
      const knowledgeMatch = pathname.match(/^\/api\/knowledge\/([^/]+)$/);
      if (knowledgeMatch && method === 'DELETE') { store.documents = store.documents.filter((d) => d.id !== knowledgeMatch[1]); return res(200, {}); }

      // ===== AI 视频 =====
      if (pathname === '/api/video/generate' && method === 'POST') return res(200, { task_id: genId() });
      if (pathname === '/api/video/tasks' && method === 'GET') return res(200, { tasks: [{ id: genId(), prompt: '测试视频提示词', status: 'completed', progress: 100, result_url: 'https://example.com/video.mp4', createdAt: new Date().toISOString() }] });

      // ===== AI 绘画 =====
      if (pathname === '/api/generate/image' && method === 'POST') return res(200, { image_url: 'https://example.com/img.png' });

      // ===== API Keys =====
      if (pathname === '/api/api-keys' && method === 'GET') return res(200, { keys: store.apiKeys });
      if (pathname === '/api/api-keys' && method === 'POST') {
        const body = await json();
        const apiKey = { id: genId(), name: body.name, key: `sk-${genId()}${genId()}`, createdAt: new Date().toISOString(), lastUsed: null };
        store.apiKeys.push(apiKey);
        return res(200, { key: apiKey });
      }
      const apiKeyMatch = pathname.match(/^\/api\/api-keys\/([^/]+)$/);
      if (apiKeyMatch && method === 'DELETE') { store.apiKeys = store.apiKeys.filter((k) => k.id !== apiKeyMatch[1]); return res(200, {}); }

      // ===== 用户设置 =====
      if (pathname === '/api/user/profile' && method === 'PUT') {
        const body = await json();
        return res(200, { user: { id: 'u1', username: body.username || 'testuser', email: body.email || 'test@example.com', avatar: '', isVerified: true, createdAt: new Date().toISOString() } });
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

// 抑制 Next 16 开发期 devtools 错误浮层（nextjs-portal）对指针事件的拦截，避免其遮挡按钮点击。
// 该浮层为 dev-only 行为，不影响生产构建；同时打印真实运行/控制台错误以便排查。
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
  page.on('pageerror', (err) => console.log('[PAGEERROR]', err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[CONSOLE.ERROR]', msg.text());
  });
});

test.describe('认证与路由守卫', () => {
  test('未登录访问受保护页面重定向到登录页', async ({ page }) => {
    await page.context().clearCookies();
    await page.goto('/zh/projects');
    await expect(page).toHaveURL(/\/zh\/login/);
    await expect(page.getByText('欢迎回来')).toBeVisible();
  });

  test('登录成功并跳转到仪表盘', async ({ page }) => {
    setupRoutes(page);
    await login(page);
    await expect(page.locator('h1')).toContainText('仪表盘');
  });

  test('登录失败显示错误提示', async ({ page }) => {
    setupRoutes(page);
    await page.goto('/zh/login');
    await page.fill('#email', 'test@example.com');
    await page.fill('#password', 'wrongpass');
    await page.click('button[type="submit"]');
    await expect(page.getByText('邮箱或密码错误')).toBeVisible();
  });

  test('验证邮箱页无需登录即可访问', async ({ page }) => {
    await page.goto('/zh/verify-email?email=test@example.com');
    await expect(page).not.toHaveURL(/\/zh\/login/);
    await expect(page.getByText('请查收邮件')).toBeVisible();
  });

  test('404 页面', async ({ page }) => {
    const response = await page.goto('/zh/this-page-does-not-exist');
    expect(response?.status()).toBe(404);
  });
});

test.describe('侧边栏导航与仪表盘', () => {
  test.beforeEach(async ({ page }) => { setupRoutes(page); await login(page); });

  test('仪表盘统计与快速开始', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('仪表盘');
    await expect(page.getByText('项目数')).toBeVisible();
    await expect(page.getByText('角色数')).toBeVisible();
    await expect(page.getByText('进行中')).toBeVisible();
    await expect(page.getByText('快速开始')).toBeVisible();
  });

  test('侧边栏可导航到所有页面', async ({ page }) => {
    const nav: Array<[string, string, string]> = [
      ['仪表盘', '/zh/', '仪表盘'],
      ['项目管理', '/zh/projects', '项目管理'],
      ['角色模拟', '/zh/characters', '角色模拟'],
      ['AI绘画', '/zh/assets', 'AI 绘画'],
      ['AI视频', '/zh/tasks', 'AI 视频'],
      ['知识库', '/zh/knowledge', '知识库'],
      ['开放平台', '/zh/api-keys', '开放平台'],
      ['设置', '/zh/settings', '设置'],
    ];
    for (const [label, href, title] of nav) {
      await page.locator('aside').getByRole('link', { name: label }).click();
      await page.waitForURL((url: URL) => url.pathname === href);
      await expect(page.locator('h1')).toContainText(title);
    }
  });
});

test.describe('项目管理（创建/生成/确认/修改/删除）', () => {
  test.beforeEach(async ({ page }) => { setupRoutes(page); await login(page); });

  test('搜索项目', async ({ page }) => {
    await page.goto('/zh/projects');
    await expect(page.locator('h1')).toContainText('项目管理');
    await expect(page.getByPlaceholder('搜索项目名...')).toBeVisible();
  });

  test('创建项目并进入详情', async ({ page }) => {
    await page.goto('/zh/projects/new');
    await page.fill('#title', '全功能测试项目');
    await page.selectOption('#genre', '奇幻');
    await page.fill('#description', '用于离线浏览器测试');
    await page.click('button[type="submit"]');
    await page.waitForURL((url: URL) => /^\/zh\/projects\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'));
    await expect(page.getByText('还没有内容')).toBeVisible();
  });

  test('流式生成并确认/修改步骤', async ({ page }) => {
    await page.goto('/zh/projects/new');
    await page.fill('#title', '生成测试项目');
    await page.click('button[type="submit"]');
    await page.waitForURL((url: URL) => /^\/zh\/projects\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'));

    await page.click('button:has-text("开始生成")');
    await expect(page.getByText('世界设定内容……')).toBeVisible();
    await expect(page.getByText('角色设定内容……')).toBeVisible();
    await expect(page.getByText('等待确认')).toHaveCount(2);

    const cards = page.locator('[data-slot="card"]');
    const lastCard = cards.last();
    await lastCard.getByText('修改').click();
    await expect(lastCard.getByText('保存修改')).toBeVisible();
    await lastCard.locator('textarea').fill('修改后的角色设定内容');
    await lastCard.getByText('保存修改').click();
    await expect(page.getByText('修改后的角色设定内容')).toBeVisible();

    const genReq = page.waitForRequest((req) => req.url().includes('/generate') && req.method() === 'POST');
    await cards.first().getByText('确认继续').click();
    await genReq;
  });

  test('删除测试项目', async ({ page }) => {
    await page.goto('/zh/projects/new');
    await page.fill('#title', '待删除项目');
    await page.click('button[type="submit"]');
    await page.waitForURL((url: URL) => /^\/zh\/projects\/[^/]+$/.test(url.pathname) && !url.pathname.endsWith('/new'));
    const pid = await page.evaluate(() => window.location.pathname.split('/').pop());

    await page.goto('/zh/projects');
    page.once('dialog', (d: any) => d.accept());
    const card = page.locator(`a[href="/zh/projects/${pid}"]`).locator('xpath=ancestor::*[@data-slot="card"]');
    await card.locator('button:has(.lucide-trash-2)').click();
    await page.waitForTimeout(400);
    await expect(page.getByText('待删除项目')).toHaveCount(0);
  });
});

test.describe('角色管理（创建/对话/表情/删除）', () => {
  test.beforeEach(async ({ page }) => { setupRoutes(page); await login(page); });

  test('搜索角色', async ({ page }) => {
    await page.goto('/zh/characters');
    await expect(page.locator('h1')).toContainText('角色模拟');
    await expect(page.getByPlaceholder('搜索角色名或设定...')).toBeVisible();
  });

  test('创建角色并进入对话，流式回复', async ({ page }) => {
    await page.goto('/zh/characters/create');
    await page.fill('#name', '全功能测试角色');
    await page.fill('#description', '用于离线浏览器测试');
    await page.click('button[type="submit"]');
    await page.waitForURL((url: URL) => /\/zh\/characters$/.test(url.pathname));
    await page.getByText('全功能测试角色').first().waitFor();

    const card = page.locator('[data-slot="card"]', { hasText: '全功能测试角色' }).first();
    const href = await card.locator('a').getAttribute('href');
    await page.goto(href!);

    await expect(page.getByText('全功能测试角色')).toBeVisible();
    await page.fill('input[placeholder*="说点什么"]', '你好，介绍一下自己');
    await page.click('button:has(.lucide-send)');
    await expect(page.getByText('我是你的AI助手。')).toBeVisible();
    await expect(page.getByText('你好，介绍一下自己')).toBeVisible();
  });

  test('对话页表情选择器与返回', async ({ page }) => {
    await page.goto('/zh/characters/create');
    await page.fill('#name', '表情测试角色');
    await page.fill('#description', '测试表情面板');
    await page.click('button[type="submit"]');
    await page.waitForURL((url: URL) => /\/zh\/characters$/.test(url.pathname));
    const card = page.locator('[data-slot="card"]', { hasText: '表情测试角色' }).first();
    const href = await card.locator('a').getAttribute('href');
    await page.goto(href!);

    await page.click('button:has(.lucide-smile)');
    await expect(page.locator('div.absolute.bottom-20').first()).toBeVisible();
    await page.click('button:has(.lucide-smile)');
    await expect(page.locator('div.absolute.bottom-20').first()).toHaveCount(0);

    await page.click('button:has(.lucide-arrow-left)');
    await expect(page).toHaveURL(/\/zh\/characters$/);
  });

  test('删除测试角色', async ({ page }) => {
    await page.goto('/zh/characters/create');
    await page.fill('#name', '待删除角色');
    await page.fill('#description', '测试删除');
    await page.click('button[type="submit"]');
    await page.waitForURL((url: URL) => /\/zh\/characters$/.test(url.pathname));

    page.once('dialog', (d: any) => d.accept());
    const card = page.locator('[data-slot="card"]', { hasText: '待删除角色' }).first();
    await card.locator('button:has(.lucide-trash-2)').click();
    await page.waitForTimeout(400);
    await expect(page.getByText('待删除角色')).toHaveCount(0);
  });
});

test.describe('知识库 / AI 视频 / AI 绘画', () => {
  test.beforeEach(async ({ page }) => { setupRoutes(page); await login(page); });

  test('知识库：Tab、上传文件、删除', async ({ page }) => {
    await page.goto('/zh/knowledge');
    await expect(page.locator('h1')).toContainText('知识库');
    await expect(page.getByRole('tab', { name: /个人文档/ })).toBeVisible();
    await expect(page.getByRole('tab', { name: /公共文档库/ })).toBeVisible();

    await page.getByRole('tab', { name: /公共文档库/ }).click();
    await expect(page.getByText('公共文档库', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: /个人文档/ }).click();

    await page.setInputFiles('input[type="file"]', `${process.env.TEMP}\\kilo\\upload.txt`);
    await expect(page.getByText('uploaded.txt')).toBeVisible();

    page.once('dialog', (d: any) => d.accept());
    await page.locator('button:has(.lucide-trash-2)').last().click();
    await expect(page.getByText('uploaded.txt')).toHaveCount(0);
  });

  test('AI 视频：提交任务并查看结果', async ({ page }) => {
    await page.goto('/zh/tasks');
    await expect(page.locator('h1')).toContainText('AI 视频');
    await page.fill('input[placeholder="描述你想要的视频内容"]', '测试视频提示词');
    await page.click('button:has-text("提交任务")');
    await expect(page.getByText('测试视频提示词')).toBeVisible();
    await expect(page.getByText('完成')).toBeVisible();
    await expect(page.getByText('查看视频')).toBeVisible();
  });

  test('AI 绘画：生成图片', async ({ page }) => {
    await page.goto('/zh/assets');
    await expect(page.locator('h1')).toContainText('AI 绘画');
    await page.fill('input[placeholder*="黑色风衣"]', '一个赛博朋克风格的剑客');
    await page.click('button:has-text("生成图片")');
    await expect(page.getByText('生成成功')).toBeVisible();
  });
});

test.describe('开放平台（API Key）', () => {
  test.beforeEach(async ({ page }) => { setupRoutes(page); await login(page); });

  test('生成 / 复制 / 删除 API Key', async ({ page }) => {
    await page.goto('/zh/api-keys');
    await expect(page.locator('h1')).toContainText('开放平台');
    await page.fill('#keyName', '全功能测试Key');
    await page.click('button:has-text("生成")');
    await expect(page.getByText('全功能测试Key')).toBeVisible();

    await page.locator('table tbody tr').first().locator('button:has(.lucide-copy)').click();
    await expect(page.getByText('已复制到剪贴板')).toBeVisible();

    page.once('dialog', (d: any) => d.accept());
    await page.locator('table tbody tr').first().locator('button:has(.lucide-trash-2)').click();
    await page.waitForTimeout(400);
    await expect(page.getByText('全功能测试Key')).toHaveCount(0);
  });
});

test.describe('设置（资料/安全/外观/AI 偏好）', () => {
  test.beforeEach(async ({ page }) => { setupRoutes(page); await login(page); });

  test('更新个人资料', async ({ page }) => {
    await page.goto('/zh/settings');
    await expect(page.locator('h1')).toContainText('设置');
    await page.fill('#username', '新用户名');
    await page.fill('#email', 'new@example.com');
    await page.click('button:has-text("保存个人资料")');
    await expect(page.getByText('个人资料已更新')).toBeVisible();
  });

  test('安全：旧密码与邮箱验证两种方式改密', async ({ page }) => {
    await page.goto('/zh/settings');
    await page.click('button:has-text("安全")');
    await expect(page.getByText('修改密码', { exact: true })).toBeVisible();

    await page.click('button:has-text("邮箱验证")');
    await page.click('button:has-text("发送验证码")');
    await expect(page.getByText('验证码已发送')).toBeVisible();

    await page.click('button:has-text("旧密码验证")');
    await page.fill('#oldPwd', '123456');
    await page.fill('#newPwd', '654321');
    await page.fill('#confirmPwd', '654321');
    await page.click('button:has-text("确认修改密码")');
    await expect(page.getByText('密码已修改')).toBeVisible();
  });

  test('外观：切换主题并上传背景', async ({ page }) => {
    await page.goto('/zh/settings');
    await page.click('button:has-text("外观")');
    await expect(page.getByText('主题与背景')).toBeVisible();
    await page.click('button:has-text("暗色")');
    await page.click('button:has-text("亮色")');

    await page.locator('input[type="file"]').first().setInputFiles(`${process.env.TEMP}\\kilo\\bg.png`);
    await expect(page.getByText('背景已更新')).toBeVisible();
    await expect(page.getByText('移除背景')).toBeVisible();
  });

  test('AI 偏好：设置提示频率', async ({ page }) => {
    await page.goto('/zh/settings');
    await page.click('button:has-text("AI 偏好")');
    await expect(page.getByText('AI 联想设置')).toBeVisible();
    await page.locator('[data-slot="select-trigger"]').click();
    await page.getByText(/高频/).click();
    await expect(page.locator('[data-slot="select-trigger"]')).toContainText('high');
  });
});

test.describe('退出登录', () => {
  test('退出后回到登录页', async ({ page }) => {
    setupRoutes(page);
    await login(page);
    await page.locator('button:has-text("退出")').first().click();
    await expect(page).toHaveURL(/\/zh\/login/);
    await expect(page.getByText('欢迎回来')).toBeVisible();
  });
});