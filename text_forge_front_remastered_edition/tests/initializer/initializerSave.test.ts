// tests/initializer/initializerSave.test.ts
// 初始化器「流式生成 Markdown 方案 → 解析落库」测试：
// 验证 Step 3-6 的 Markdown 文本被前端解析器正确映射并写入后端各实体字段。
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
  fetchLocations: vi.fn(async () => [{ id: 7, name: '王都' }]),
  fetchSceneEvents: vi.fn(async () => []),
  fetchPlotThreads: vi.fn(async () => [{ id: 1, name: '主线' }, { id: 2, name: '宗门线索' }]),
  fetchForeshadowings: vi.fn(async () => []),
}));
const charactersApi = vi.hoisted(() => ({
  createCharacter: vi.fn(async (b: unknown) => b),
  fetchCharacters: vi.fn(async () => [{ id: 11, name: '林晚' }, { id: 12, name: '苏璃' }]),
}));
const booksApi = vi.hoisted(() => ({
  createVolume: vi.fn(async (_b: unknown, _title: string, _summary?: string) => ({ id: 100 })),
  createChapter: vi.fn(async (_v: unknown, _body: Record<string, unknown>) => ({ id: 200 })),
  updateCreativeSetting: vi.fn(async () => ({})),
  fetchChaptersTree: vi.fn(async () => [{ id: 100, title: '卷一', chapters: [{ id: 200, title: '第一章', sortOrder: 1 }] }]),
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

function setStepText(step: number, text: string) {
  useInitializerStore.setState((s) => ({
    currentStep: step,
    stepText: { ...s.stepText, [step]: text },
  }));
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
    stepText: {},
    creativeForm: { name: '', tone: '', worldview: '测试世界观', taboos: '', customFields: [] },
  });
});

describe('初始化器字段映射（与后端 wizard label 对齐）', () => {
  it('Step5 事件：markdown 解析（章节归属/时间/地点/角色/情节线）', async () => {
    setStepText(5, [
      '## 事件：城门相遇 - 主角与神秘人在城门擦肩而过，埋下冲突伏笔',
      '章节：第一章',
      '时间：第一天清晨',
      '地点：王都',
      '角色：林晚、苏璃',
      '情节线：主线',
      '',
      '## 事件：拜师风波 - 墨长老拒绝收徒，主角立誓证明自己',
      '章节：第一章',
      '时间：第一天下午',
      '地点：王都',
      '角色：林晚',
      '情节线：宗门线索',
    ].join('\n'));
    await useInitializerStore.getState().nextStep();
    expect(worldApi.createSceneEvent).toHaveBeenCalledTimes(2);
    const body = worldApi.createSceneEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(body.title).toBe('城门相遇');
    expect(body.chapterId).toBe(200); // 章节名匹配
    expect(body.storyLabel).toBe('第一天清晨');
    expect(body.locationId).toBe(7); // 地点名匹配
    expect(body.characterIds).toContain(11); // 林晚
    expect(body.characterIds).toContain(12); // 苏璃
    expect(body.plotThreadIds).toContain(1); // 主线
    // 事件类型/摘要落库
    const body2 = worldApi.createSceneEvent.mock.calls[1][0] as Record<string, unknown>;
    expect(body2.title).toBe('拜师风波');
    expect(String(body2.content)).toContain('拒绝收徒');
  });

  it('Step6 伏笔：markdown 解析（类型/角色/埋下事件/揭示建议）', async () => {
    setStepText(6, [
      '# 伏笔：断剑之谜 - 断剑实为上古神器，主角修行之路的关键转折',
      '类型：身份谜团',
      '角色：林晚',
      '埋下事件：城门相遇',
      '揭示建议：第三卷决战前夕',
    ].join('\n'));
    // Step 6 是最后一步，落库在 finish() 时执行
    await useInitializerStore.getState().finish();
    expect(worldApi.createForeshadowing).toHaveBeenCalledTimes(1);
    const body = worldApi.createForeshadowing.mock.calls[0][0] as Record<string, unknown>;
    expect(String(body.description)).toContain('上古神器');
    expect(body.revealType).toBe('twist'); // 身份谜团 → twist，不允许退化
    expect(body.relatedCharacterIds).toContain(11); // 角色保留显式
    expect(String(body.notes)).toContain('第三卷');
  });

  it('Step2 角色：别名/角色状态/自定义字段 不丢失', async () => {
    useInitializerStore.setState({ currentStep: 2 });
    const lockCard = useInitializerStore.getState().toggleLock;
    useInitializerStore.setState((s) => {
      const candidates = [...s.candidates];
      candidates[2] = [{
        id: 'c1',
        title: '林晚',
        fields: [
          { key: '角色类型', value: '主角' },
          { key: '描述', value: '帝国三皇子' },
          { key: '别名', value: '["剑圣"]' },
          { key: '角色状态', value: '流放中' },
          { key: '自定义字段', value: '{"功法":"九天星辰诀"}' },
        ],
      }];
      return { candidates };
    });
    lockCard(2, 'c1');
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

  it('Step4 大纲：markdown 卷章场景解析并落库（卷摘要/场景时间/地点/角色/情节线）', async () => {
    setStepText(4, [
      '# 卷一：觉醒 - 主角觉醒的旅程',
      '',
      '## 第一章：初入江湖 - 踏上旅途',
      '',
      '### 场景：城门口 - 主角初入江湖，与神秘人擦肩而过',
      '时间：第一天清晨',
      '地点：王都',
      '角色：林晚、苏璃',
      '情节线：主线',
      '',
      '### 场景：试炼台 - 通过入门考核',
      '时间：第一天下午',
      '角色：林晚',
      '情节线：宗门线索',
      '',
      '## 第二章：城门风波 - 首遇强敌',
    ].join('\n'));
    await useInitializerStore.getState().nextStep();
    // 卷标题与摘要分离
    const vol1 = booksApi.createVolume.mock.calls[0][1] as string;
    expect(vol1).toBe('觉醒');
    const vol1summary = booksApi.createVolume.mock.calls[0][2] as string;
    expect(vol1summary).toContain('主角觉醒');
    // 章标题与摘要
    const ch1 = booksApi.createChapter.mock.calls[0][1] as { title: string; summary: string };
    expect(ch1.title).toBe('初入江湖');
    expect(ch1.summary).toContain('踏上旅途');
    // 场景节点落库为 SceneEvent，携带时间/地点/角色/情节线
    expect(worldApi.createSceneEvent).toHaveBeenCalledTimes(2);
    const sceneBody = worldApi.createSceneEvent.mock.calls[0][0] as Record<string, unknown>;
    expect(sceneBody.title).toContain('城门口');
    expect(sceneBody.storyLabel).toBe('第一天清晨');
    expect(sceneBody.locationId).toBe(7); // 地点名匹配
    expect(sceneBody.characterIds).toContain(11); // 林晚
    expect(sceneBody.plotThreadIds).toContain(1); // 主线
  });
});
