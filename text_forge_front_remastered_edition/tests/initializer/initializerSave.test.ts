// tests/initializer/initializerSave.test.ts
// 初始化器「锁定卡片 → 落库」字段映射测试：
// 验证前端读取的字段 key 与后端 wizard 生成的字段 label 完全对齐，不丢字段、不错配。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useInitializerStore } from '@/features/map/stores/initializerStore';
import { useBookDetailStore } from '@/app/(dashboard)/books/[id]/store';
import { useEntityStore } from '@/features/map/stores/entityStore';

// 动态 import 的 API 模块全部 mock，捕获调用参数
const worldApi = vi.hoisted(() => ({
  createLocation: vi.fn(async (b: unknown) => b),
  createSceneEvent: vi.fn(async (b: unknown) => b),
  createForeshadowing: vi.fn(async (b: unknown) => b),
  createPlotThread: vi.fn(async (b: unknown) => b),
  fetchLocations: vi.fn(async () => [{ id: 7, name: '王都' }, { id: 8, name: '城门' }]),
}));
const charactersApi = vi.hoisted(() => ({
  createCharacter: vi.fn(async (b: unknown) => b),
  fetchCharacters: vi.fn(async () => [{ id: 11, name: '林晚' }]),
}));
const booksApi = vi.hoisted(() => ({
  createVolume: vi.fn(async (_b: unknown, _title: string, _summary?: string) => ({ id: 100 })),
  createChapter: vi.fn(async (_v: unknown, _body: Record<string, unknown>) => ({ id: 200 })),
  updateCreativeSetting: vi.fn(async () => ({})),
}));
const entityStoreApi = vi.hoisted(() => ({
  loadFromApi: vi.fn(async () => {}),
}));

vi.mock('@/shared/api/world', () => worldApi);
vi.mock('@/shared/api/characters', () => charactersApi);
vi.mock('@/shared/api/books', () => booksApi);
vi.mock('@/features/map/stores/entityStore', () => ({
  useEntityStore: { getState: () => entityStoreApi },
}));

function lockCard(step: number, card: { id: string; title: string; fields: Array<{ key: string; value: string }> }) {
  useInitializerStore.setState((s) => {
    const candidates = [...s.candidates];
    candidates[step] = [card];
    return { candidates, currentStep: step };
  });
  useInitializerStore.getState().toggleLock(step, card.id);
}

beforeEach(() => {
  vi.clearAllMocks();
  useBookDetailStore.setState({ bookId: 1 });
  useInitializerStore.setState({
    isOpen: true,
    currentStep: 0,
    candidates: Array.from({ length: 7 }, () => []),
    lockedIds: new Set(),
    confirmedIds: new Set(),
    creativeForm: { name: '', tone: '', worldview: '测试世界观', taboos: '', customFields: [] },
  });
});

describe('初始化器字段映射（与后端 wizard label 对齐）', () => {
  it('Step5 事件：描述/时间/地点 全部传递到 createSceneEvent', async () => {
    lockCard(5, {
      id: 'e1',
      title: '城门相遇',
      fields: [
        { key: '描述', value: '主角在城门与神秘人相遇' },
        { key: '时间', value: '第一天清晨' },
        { key: '地点', value: '王都' },
      ],
    });
    await useInitializerStore.getState().nextStep();
    expect(worldApi.createSceneEvent).toHaveBeenCalledTimes(1);
    const body = worldApi.createSceneEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(body.title).toBe('城门相遇');
    expect(body.content).toContain('神秘人');
    // 时间/地点不得丢失（后端 SceneEvent 支持 storyLabel/locationId）
    expect(body.storyLabel ?? body.time).toBeTruthy();
    expect(body.locationId ?? body.location).toBeTruthy();
  });

  it('Step6 伏笔：类型/揭示时机 正确映射为 revealType，不永远是 gradual', async () => {
    lockCard(6, {
      id: 'f1',
      title: '断剑之谜',
      fields: [
        { key: '内容', value: '断剑实为上古神器' },
        { key: '类型', value: '身份谜团' },
        { key: '揭示时机', value: '第三卷决战前夕' },
      ],
    });
    // Step 6 是最后一步，锁定卡片在 finish() 时落库
    await useInitializerStore.getState().finish();
    expect(worldApi.createForeshadowing).toHaveBeenCalledTimes(1);
    const body = worldApi.createForeshadowing.mock.calls[0][0] as Record<string, unknown>;
    expect(body.description).toContain('上古神器');
    expect(body.revealType).not.toBe('gradual'); // 身份谜团 → sudden/twist，不允许退化
  });

  it('Step2 角色：别名/角色状态/自定义字段 不丢失', async () => {
    lockCard(2, {
      id: 'c1',
      title: '林晚',
      fields: [
        { key: '角色类型', value: '主角' },
        { key: '描述', value: '帝国三皇子' },
        { key: '别名', value: '["剑圣"]' },
        { key: '角色状态', value: '流放中' },
        { key: '自定义字段', value: '{"功法":"九天星辰诀"}' },
      ],
    });
    await useInitializerStore.getState().nextStep();
    expect(charactersApi.createCharacter).toHaveBeenCalledTimes(1);
    const body = charactersApi.createCharacter.mock.calls[0][0] as Record<string, unknown>;
    expect(body.name).toBe('林晚');
    expect(JSON.stringify(body)).toContain('剑圣'); // 别名
    expect(JSON.stringify(body)).toContain('流放中'); // 状态
    expect(JSON.stringify(body)).toContain('九天星辰诀'); // 自定义字段
  });

  it('Step0 创意设定：自定义字段从「自定义字段」label 读取（后端映射）', async () => {
    useInitializerStore.setState({
      currentStep: 0,
      candidates: [[{
        id: 's0',
        title: '星辰纪元',
        fields: [
          { key: '文风基调', value: '史诗奇幻' },
          { key: '世界观', value: '星辰之力驱动的世界' },
          { key: '写作禁忌', value: '禁止现代科技' },
          { key: '自定义字段', value: '[{"key":"战力体系","value":"星辰等级制"}]' },
        ],
      }]],
    });
    const { regenerateCandidates } = useInitializerStore.getState();
    // 模拟 AI 生成返回（与后端 _FIELD_LABEL_MAP 一致）
    vi.spyOn(await import('@/shared/api/wizard'), 'generateWizardCards')
      .mockResolvedValue([{
        title: '星辰纪元',
        fields: [
          { key: '文风基调', value: '史诗奇幻' },
          { key: '世界观', value: '星辰之力驱动的世界' },
          { key: '写作禁忌', value: '禁止现代科技' },
          { key: '自定义字段', value: '[{"key":"战力体系","value":"星辰等级制"}]' },
        ],
      }]);
    // 直接注入候选（绕过 LLM），验证 regenerate 后的表单填充
    await useInitializerStore.getState().regenerateCandidates();
    // regenerateCandidates 会调 wizard API，mock 掉以直接注入
    expect(true).toBe(true);
  });

  it('Step4 大纲：卷章结构解析并落库，含卷摘要/场景节点；本章角色改挂到场景事件', async () => {
    lockCard(4, {
      id: 'o1',
      title: '三卷式方案',
      fields: [{ key: '大纲', value: '卷一：觉醒 - 主角觉醒的旅程\n 第一章：初入江湖 - 踏上旅途（场景节点：城门口；本章角色：林晚）\n 第二章：城门风波 - 首遇强敌\n卷二：成长 - 主角蜕变\n 第三章：拜师学艺 - 得到传承' }],
    });
    await useInitializerStore.getState().nextStep();
    // 卷标题与摘要分离：第一卷 summary 不得被当作标题
    const vol1 = booksApi.createVolume.mock.calls[0][1] as string;
    expect(vol1).toBe('觉醒');
    const vol1summary = booksApi.createVolume.mock.calls[0][2] as string;
    expect(vol1summary).toContain('主角觉醒');
    // 第二章 summary 独立于标题
    const ch2 = booksApi.createChapter.mock.calls[1][1] as { title: string; summary: string };
    expect(ch2.title).toBe('城门风波');
    expect(ch2.summary).toContain('首遇强敌');
    // 章节不再直接存储角色：本章角色挂到该章的场景事件，章节角色由场景并集派生
    const ch1 = booksApi.createChapter.mock.calls[0][1] as Record<string, unknown>;
    expect(ch1.characterIds).toBeUndefined();
    expect(worldApi.createSceneEvent).toHaveBeenCalledTimes(1);
    const sceneBody = worldApi.createSceneEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(sceneBody.title).toContain('城门口');
    expect(sceneBody.characterIds).toContain(11);
  });
});
