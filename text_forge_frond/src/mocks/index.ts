// src/mocks/index.ts
// 开发期 mock 入口：根据请求路径分发给各 handler。
// 仅在 NODE_ENV !== 'production' 时由 proxy.ts 启用，不影响生产。
import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { MOCK_USER } from './data';
import {
  handleLogin,
  handleProjectsGet,
  handleProjectsPost,
  handleProjectDetail,
  handleProjectPut,
  handleProjectDelete,
  handleCharactersGet,
  handleCharactersPost,
  handleCharacterDetail,
  handleCharacterPut,
  handleCharacterDelete,
  handleCharacterAvatar,
  handleCharacterMessages,
  handleCharacterChat,
} from './handlers';

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

// 生成类任务：返回一个带 id 的占位，便于前端轮询/展示（不会真正产出媒体）
async function mockMediaTask(kind: 'image' | 'video', req: NextRequest) {
  let prompt = '';
  try {
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const body = (await req.json()) as { prompt?: string };
      prompt = body?.prompt ?? '';
    }
  } catch { /* ignore */ }
  return json({
    task: {
      id: `mock-${kind}-${Date.now()}`,
      kind,
      prompt,
      status: 'completed',
      progress: 100,
      result_url: kind === 'image' ? 'https://picsum.photos/seed/mock/512' : 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4',
      createdAt: new Date().toISOString(),
    },
  });
}

export async function handleDevApi(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const url = `${pathname}${search}`;
  const method = req.method;

  // ---- 鉴权 ----
  if (url === '/api/auth/login' && method === 'POST') return handleLogin();
  if (url === '/api/auth/register' && method === 'POST') return json({ message: '验证邮件已发送', email: MOCK_USER.email });
  if (url === '/api/auth/refresh' && method === 'POST') return json({ access_token: 'dev-access-token' });
  if (url === '/api/auth/send-verify-code' && method === 'POST') return json({ message: '验证码已发送' });
  if (url === '/api/auth/verify-email' && method === 'POST') return json({ message: 'ok' });
  if (url === '/api/auth/resend-verify' && method === 'POST') return json({ message: '验证邮件已重新发送' });
  if (url === '/api/auth/logout' && method === 'POST') return json({});
  if (url === '/api/user/profile' && method === 'PUT') return json({ user: MOCK_USER });
  if (url === '/api/user/avatar' && method === 'POST') return json({ avatar_url: '' });

  // ---- 项目 ----
  if (url === '/api/projects' && method === 'GET') return await handleProjectsGet();
  if (url === '/api/projects' && method === 'POST') return await handleProjectsPost(req);
  if (url.startsWith('/api/projects/') && url.endsWith('/generate')) return json({ ignored: true });
  if (url.startsWith('/api/projects/') && url.endsWith('/confirm')) return json({ ok: true });
  if (url.startsWith('/api/projects/') && url.match(/\/steps\/[^/]+$/) && method === 'PUT') return json({ ok: true });
  if (url.startsWith('/api/projects/') && url.endsWith('/characters') && method === 'GET') return json({ characters: [] });
  if (url.startsWith('/api/projects/') && url.endsWith('/portfolio') && method === 'GET') return json({ items: [] });
  if (url.startsWith('/api/projects/') && url.endsWith('/brief') && method === 'PUT') return json({ ok: true });

  const projIdMatch = url.match(/^\/api\/projects\/([^/]+)$/);
  if (projIdMatch) {
    const id = projIdMatch[1];
    if (method === 'GET') return await handleProjectDetail(id);
    if (method === 'PUT') return await handleProjectPut(id, req);
    if (method === 'DELETE') return handleProjectDelete(id);
  }

  // ---- 角色 ----
  if (url === '/api/characters' && method === 'GET') return await handleCharactersGet();
  if (url === '/api/characters' && method === 'POST') return await handleCharactersPost(req);

  const charMatch = url.match(/^\/api\/characters\/([^/]+)(\/.*)?$/);
  if (charMatch) {
    const id = charMatch[1];
    const sub = charMatch[2] ?? '';
    if (sub === '/messages' && method === 'GET') return handleCharacterMessages(id);
    if (sub === '/chat' && method === 'POST') return handleCharacterChat(req, id);
    if (sub === '/avatar' && method === 'POST') return await handleCharacterAvatar(id, req);
    if (sub === '' && method === 'GET') return await handleCharacterDetail(id);
    if (sub === '' && method === 'PUT') return await handleCharacterPut(id, req);
    if (sub === '' && method === 'DELETE') return handleCharacterDelete(id);
  }

  // ---- 媒体生成 ----
  if (url === '/api/generate/image' && method === 'POST') return await mockMediaTask('image', req);
  if (url === '/api/generate/image/results' && method === 'GET') return json({ tasks: [], results: [] });
  if (url === '/api/video/generate' && method === 'POST') return await mockMediaTask('video', req);
  if (url === '/api/video/tasks' && method === 'GET') return json({ tasks: [] });

  // ---- 知识库 / 模型 / API Key / 工作流 / 同步 ----
  // 注意：这些路由标注 mocked:true，告知前端"后端未就绪"，前端据此回退本地数据。
  if (url === '/api/knowledge' && method === 'GET') return json({ documents: [], mocked: true });
  if (url === '/api/knowledge' && method === 'POST') return json({ document: { id: 'mock-doc', name: 'uploaded.txt', status: 'indexed', createdAt: new Date().toISOString() } });
  if (url === '/api/knowledge/public' && method === 'GET') return json({ documents: [], mocked: true });
  if (url.startsWith('/api/knowledge/') && method === 'DELETE') return json({});
  if (url === '/api/api-keys' && method === 'GET') return json({ keys: [] });
  if (url === '/api/api-keys' && method === 'POST') return json({ key: { id: 'mock-key', name: '测试密钥', key: 'sk-mock', createdAt: new Date().toISOString(), lastUsed: null } });
  if (url.startsWith('/api/api-keys/') && method === 'DELETE') return json({});
  if (url.startsWith('/api/user/models/') && method === 'PUT') return json({ ok: true });
  if (url === '/api/user/change-password' && method === 'POST') return json({});
  if (url === '/api/user/change-password-by-email' && method === 'POST') return json({});
  if (url === '/api/workflows' && method === 'GET') return json({ workflows: [], mocked: true });
  if (url.startsWith('/api/workflows/') && method === 'GET') return json({ workflow: null, mocked: true });
  if (url.startsWith('/api/workflows/') && method === 'DELETE') return json({ ok: true, mocked: true });
  if (url === '/api/sync' && method === 'GET') return json({ updates: [], version: 1 });

  // 其余接口：返回空成功体，避免前端报错卡死
  return json({ ok: true, mocked: true });
}
