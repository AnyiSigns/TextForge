// mock 层单元测试：验证开发期 mock 处理器（src/mocks/handlers、src/mocks/index）
// 的路由分发与进程内仓储行为，覆盖角色对话持久化、参考图取消( null )、生成任务回显等。
// 沿用真实 mock 链路（不替换 next/server，直接在 vitest 中调用 mock 处理器，
// 与 dev 下 proxy.ts 走 handleDevApi 的方式一致），仅传入轻量 NextRequest 替身。
import { describe, it, expect, beforeEach } from 'vitest';
import {
  handleCharacterChat,
  handleCharacterMessages,
  handleCharacterPut,
  handleCharacterDetail,
  handleCharactersGet,
  handleCharactersPost,
  handleProjectsPost,
  __resetMockStores,
} from '@/mocks/handlers';
import { handleDevApi } from '@/mocks/index';

// 轻量 NextRequest 替身：mock handler 只用到 nextUrl / method / headers / json / formData
function makeReq(opts: {
  url: string;
  method?: string;
  body?: Record<string, unknown>;
  formData?: Map<string, unknown>;
}): any {
  const body = opts.body ?? {};
  return {
    nextUrl: { pathname: opts.url, search: '' },
    method: opts.method ?? 'POST',
    headers: new Map([['content-type', 'application/json']]),
    async json() {
      return body;
    },
    async formData() {
      return opts.formData ?? new Map<string, unknown>();
    },
  };
}

// 读取 NextResponse 的实际 body
async function bodyOf(res: any): Promise<any> {
  return res?.json ? await res.json() : res?.body;
}

beforeEach(() => {
  // 清空进程内仓储，避免共享 charId 的对话/角色用例间状态污染
  __resetMockStores();
});

describe('mock - 角色对话持久化 (P6)', () => {
  const charId = 'dev-c-1';

  it('单次发送会写入 user + assistant 两条消息', async () => {
    const req = makeReq({
      url: `/api/characters/${charId}/chat`,
      method: 'POST',
      body: { character_name: '林墨', message: '你好', character_description: '拾荒者' },
    });
    await handleCharacterChat(req as any, charId);
    const msgs = await bodyOf(await handleCharacterMessages(charId));
    const list = msgs.messages as Array<{ role: string; content: string }>;
    expect(list.filter((m) => m.role === 'user').length).toBe(1);
    expect(list.filter((m) => m.role === 'assistant').length).toBe(1);
    expect(list[0].content).toContain('你好');
  });

  it('再次发送会追加而非覆盖（模拟刷新后历史保留）', async () => {
    const first = makeReq({
      url: `/api/characters/${charId}/chat`,
      method: 'POST',
      body: { character_name: '林墨', message: '第一句' },
    });
    const second = makeReq({
      url: `/api/characters/${charId}/chat`,
      method: 'POST',
      body: { character_name: '林墨', message: '第二句' },
    });
    await handleCharacterChat(first as any, charId);
    await handleCharacterChat(second as any, charId);
    const msgs = await bodyOf(await handleCharacterMessages(charId));
    const list = msgs.messages as Array<{ role: string; content: string }>;
    expect(list.filter((m) => m.role === 'user').map((m) => m.content)).toEqual(['第一句', '第二句']);
  });
});

describe('mock - 角色参考图取消 (P: 取消参考图不生效)', () => {
  it('PUT referenceImage: null 被正常接收 (不再因序列化丢失)', async () => {
    const created = await handleCharactersPost(makeReq({ url: '/api/characters', method: 'POST', body: { name: '测试角色', projectId: 'dev-p-1', referenceImage: 'https://x/y.png' } }));
    const id = (await bodyOf(created)).character.id as string;

    await handleCharacterPut(id, makeReq({ url: `/api/characters/${id}`, method: 'PUT', body: { referenceImage: null } }) as any);
    const detail = await bodyOf(await handleCharacterDetail(id));
    // 关键断言：null 透传到回显，UI 据此判定"已取消"
    expect(detail.character.referenceImage).toBeNull();
  });

  it('PUT referenceImage: 字符串时保留', async () => {
    const created = await handleCharactersPost(makeReq({ url: '/api/characters', method: 'POST', body: { name: '角色B', projectId: 'dev-p-1' } }));
    const id = (await bodyOf(created)).character.id as string;
    await handleCharacterPut(id, makeReq({ url: `/api/characters/${id}`, method: 'PUT', body: { referenceImage: 'https://a/b.png' } }) as any);
    const detail = await bodyOf(await handleCharacterDetail(id));
    expect(detail.character.referenceImage).toBe('https://a/b.png');
  });
});

describe('mock - 项目/角色 创建回显', () => {
  it('POST 项目回显 title/description', async () => {
    const res = await handleProjectsPost(makeReq({ url: '/api/projects', method: 'POST', body: { title: '新世界', description: 'desc', genre: '科幻' } }));
    const p = (await bodyOf(res)).project;
    expect(p.title).toBe('新世界');
    expect(p.description).toBe('desc');
    expect(p.id).toMatch(/^dev-p-/);
  });

  it('POST 角色回显 name/projectId/images', async () => {
    const res = await handleCharactersPost(makeReq({ url: '/api/characters', method: 'POST', body: { name: '阿强', projectId: 'dev-p-2', images: ['https://x/1.png'] } }));
    const c = (await bodyOf(res)).character;
    expect(c.name).toBe('阿强');
    expect(c.projectId).toBe('dev-p-2');
    expect(c.images).toEqual(['https://x/1.png']);
  });

  it('GET 角色会合并 mock 预置角色', async () => {
    const res = await handleCharactersGet();
    const names = ((await bodyOf(res)).characters as Array<{ name: string }>).map((c) => c.name);
    expect(names).toContain('林墨');
  });
});

describe('mock - index 路由分发（dev 下 proxy.ts 同链路）', () => {
  it('分发登录请求', async () => {
    const res = await handleDevApi(makeReq({ url: '/api/auth/login', method: 'POST' }) as any);
    expect((await bodyOf(res)).user).toBeDefined();
  });

  it('分发图片生成：返回带 id 的占位任务并透传按用途字段', async () => {
    const res = await handleDevApi(makeReq({ url: '/api/generate/image', method: 'POST', body: { prompt: '一只猫', character_ids: ['dev-c-1'], reference_images: ['https://x/y.png'] } }) as any);
    const task = (await bodyOf(res)).task;
    expect(task.id).toMatch(/^mock-image-/);
    expect(task.status).toBe('completed');
    expect(task.kind).toBe('image');
    // P0：按用途传入的 character_ids / reference_images / prompt 透传（不被 mock 丢弃）
    expect(task.prompt).toBe('一只猫');
  });

  it('分发视频生成：返回视频占位任务', async () => {
    const res = await handleDevApi(makeReq({ url: '/api/video/generate', method: 'POST', body: { prompt: '动画', useCase: 'chapter_anim', character_ids: ['dev-c-1'] } }) as any);
    const task = (await bodyOf(res)).task;
    expect(task.id).toMatch(/^mock-video-/);
    expect(task.kind).toBe('video');
    expect(task.result_url).toContain('.mp4');
  });

  it('未知接口返回 mocked 成功体', async () => {
    const res = await handleDevApi(makeReq({ url: '/api/unknown/path', method: 'GET' }) as any);
    expect((await bodyOf(res)).mocked).toBe(true);
  });
});
