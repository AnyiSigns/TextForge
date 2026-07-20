// src/mocks/handlers.ts
// 开发期 mock 的路由处理。每个函数返回 NextResponse，供 proxy.ts 调用。
// 使用进程内内存仓储，让「创建 → 列表/详情 → 编辑/删除」在后端未就绪时自洽可演示；
// POST/PUT 一律回显请求体，避免返回固定假数据覆盖前端真实输入。
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { MOCK_USER, MOCK_PROJECTS, MOCK_CHARACTERS, MOCK_PROJECT_STEPS } from './data';
import type { Message } from '@/types';

// 进程内对话仓储：按角色 id 持久化消息，刷新后仍可从 /messages 读回
const chatStore = new Map<string, Message[]>();

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function now() {
  return new Date().toISOString();
}

async function parseBody(req: NextRequest): Promise<Record<string, unknown>> {
  try {
    const ct = req.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      return (await req.json()) as Record<string, unknown> ?? {};
    }
    if (ct.includes('multipart/form-data') || ct.includes('application/x-www-form-urlencoded')) {
      const form = await req.formData();
      return Object.fromEntries(form.entries());
    }
    return {};
  } catch {
    return {};
  }
}

// ---- 内存仓储 ----
const projectsStore: Record<string, Record<string, unknown>> = {};
const charactersStore: Record<string, Record<string, unknown>> = {};
let seq = 0;
function uid(prefix: string) {
  seq += 1;
  return `${prefix}-${Date.now()}-${seq}`;
}

// 测试用：清空进程内仓储，避免用例间（尤其是共享 charId 的对话/角色）状态污染
export function __resetMockStores() {
  for (const k of Object.keys(projectsStore)) delete projectsStore[k];
  for (const k of Object.keys(charactersStore)) delete charactersStore[k];
  chatStore.clear();
}

// ============ 鉴权 ============
export function handleLogin() {
  const res = NextResponse.json({
    user: MOCK_USER,
    access_token: 'dev-access-token',
    refresh_token: 'dev-refresh-token',
  });
  res.cookies.set('tf_rt', 'dev-refresh-token', {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}

// ============ 项目 ============
export function handleProjectsGet() {
  // 标准方案：MOCK_PROJECTS 是"基础事实"（含 title 等权威字段），
  // 用户在内存仓储新建的项目（id 不在 mock 中）作为增量追加；
  // mock 已有项目以 MOCK_PROJECTS 为准，避免被残缺记录（缺 title）覆盖导致页面"未知项目"。
  const mockIds = new Set(MOCK_PROJECTS.map((p) => p.id));
  const userProjects = Object.values(projectsStore).filter((p) => !mockIds.has((p.id as string) ?? ''));
  return json({ projects: [...MOCK_PROJECTS, ...userProjects] });
}

export async function handleProjectsPost(req: NextRequest) {
  const body = await parseBody(req);
  const id = uid('dev-p');
  const project = {
    id,
    title: typeof body.title === 'string' ? body.title : '未命名项目',
    description: typeof body.description === 'string' ? body.description : '',
    genre: typeof body.genre === 'string' ? body.genre : 'general',
    status: 'draft' as const,
    createdAt: now(),
    updatedAt: now(),
  };
  projectsStore[id] = project;
  return json({ project });
}

export function handleProjectDetail(id: string) {
  const stored = projectsStore[id];
  if (stored) {
    return json({ project: stored, steps: MOCK_PROJECT_STEPS });
  }
  // 未知 id（如 mock 预置项目）：返回基础信息与示例步骤，便于演示
  const base = MOCK_PROJECTS.find((p) => p.id === id);
  return json({
    project: base ?? { id, title: '星海拾遗', status: 'draft', createdAt: now(), updatedAt: now() },
    steps: MOCK_PROJECT_STEPS,
  });
}

export async function handleProjectPut(id: string, req: NextRequest) {
  const body = await parseBody(req);
  const prev = projectsStore[id] ?? { id, createdAt: now() };
  const next = { ...prev, ...body, id, updatedAt: now() };
  projectsStore[id] = next;
  return json({ project: next });
}

export function handleProjectDelete(id: string) {
  delete projectsStore[id];
  return json({ ok: true });
}

// ============ 角色 ============
export function handleCharactersGet() {
  // 预置角色 + 运行时创建角色按 id 去重合并（运行时优先覆盖同 id）
  const stored = Object.values(charactersStore);
  const storedIds = new Set(stored.map((c) => c.id));
  const merged = [...stored, ...MOCK_CHARACTERS.filter((c) => !storedIds.has(c.id))];
  return json({ characters: merged });
}

export async function handleCharactersPost(req: NextRequest) {
  const body = await parseBody(req);
  const id = uid('dev-c');
  const character = {
    id,
    name: typeof body.name === 'string' ? body.name : '未命名角色',
    description: typeof body.description === 'string' ? body.description : '',
    projectId: (body.projectId as string | null) ?? null,
    avatar: typeof body.avatar === 'string' ? body.avatar : undefined,
    images: Array.isArray(body.images) ? body.images : [],
    createdAt: now(),
  };
  charactersStore[id] = character;
  return json({ character });
}

export function handleCharacterDetail(id: string) {
  const stored = charactersStore[id];
  if (stored) return json({ character: { name: '', description: '', ...stored } });
  const base = MOCK_CHARACTERS.find((c) => c.id === id);
  return json({ character: base ?? { id, name: '', description: '' } });
}

export async function handleCharacterPut(id: string, req: NextRequest) {
  const body = await parseBody(req);
  const prev = charactersStore[id] ?? { id, createdAt: now() };
  const next = { ...prev, ...body, id, createdAt: prev.createdAt ?? now() };
  charactersStore[id] = next;
  return json({ character: next });
}

export function handleCharacterDelete(id: string) {
  delete charactersStore[id];
  return json({ ok: true });
}

export async function handleCharacterAvatar(id: string, req: NextRequest) {
  const form = await req.formData().catch(() => null);
  const urlField = form?.get('url') as string | null;
  let url: string;
  if (urlField) {
    url = urlField;
  } else {
    const file = form?.get('file');
    if (file instanceof File) {
      // dev mock 下没有真实对象存储：把上传的文件转成 data URL 返回，
      // 让前端能正确显示用户设置的头像（而非随机占位图）
      const buf = Buffer.from(await file.arrayBuffer());
      const mime = file.type || 'image/png';
      url = `data:${mime};base64,${buf.toString('base64')}`;
    } else {
      url = `https://picsum.photos/seed/${id}/200`;
    }
  }
  if (charactersStore[id]) {
    charactersStore[id] = { ...charactersStore[id], avatar: url };
  }
  return json({ avatar_url: url, url, avatar: url });
}

export function handleCharacterMessages(id: string) {
  const list = chatStore.get(id) ?? [];
  return json({ messages: list });
}

export async function handleCharacterChat(req: NextRequest, id: string) {
  const body = await parseBody(req);
  const characterName = (body.character_name as string | undefined) || '角色';
  const characterDesc = (body.character_description as string | undefined) || '';
  const userMessage = (body.message as string | undefined) || '';
  const brief = (body.brief as string | undefined) || '';
  const history: Array<{ role: string; content: string }> =
    Array.isArray(body.messages) ? (body.messages as Array<{ role: string; content: string }>) : [];

  // 基于角色设定 + 上下文拼出一个有语义的占位回复（mock 期不调真模型）
  const lines: string[] = [];
  lines.push(userMessage ? `（${characterName}听你这么说，指尖在桌沿轻叩。）` : '');
  if (characterDesc) {
    lines.push(`我是${characterName}。${characterDesc.slice(0, 40)}${characterDesc.length > 40 ? '…' : ''}`);
  }
  if (brief) {
    lines.push(`（目光扫过案头的世界观设定）${brief.slice(0, 30)}…这些我比谁都清楚。`);
  }
  if (history.length > 1) {
    lines.push(`我们方才聊到的那些，我仍记着。`);
  }
  lines.push(`你问的「${userMessage.slice(0, 24)}${userMessage.length > 24 ? '…' : ''}」——容我想想，夜还长，故事才刚开了个头。`);
  const reply = lines.filter(Boolean).join('\n');

  // 持久化本轮对话（用户 + 助手）到进程内仓储
  const prev = chatStore.get(id) ?? [];
  const next: Message[] = [
    ...prev,
    { id: `${id}-u-${Date.now()}`, role: 'user', content: userMessage, timestamp: new Date().toISOString() },
    { id: `${id}-a-${Date.now()}`, role: 'assistant', content: reply, timestamp: new Date().toISOString() },
  ];
  chatStore.set(id, next);

  // 按字符分片，模拟 SSE 流式输出（前端 sendChatMessage 已按 data: {...} 逐行解析）
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const step = 4;
      for (let i = 0; i < reply.length; i += step) {
        const chunk = reply.slice(i, i + step);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: chunk })}\n\n`));
        await new Promise((r) => setTimeout(r, 24));
      }
      controller.enqueue(encoder.encode('data: [DONE]\n\n'));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
