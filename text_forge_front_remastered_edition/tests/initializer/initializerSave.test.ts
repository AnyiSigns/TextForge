// tests/initializer/initializerSave.test.ts
// 初始化器「流式生成 Markdown 方案 → 解析落库」测试：
// 验证 Step 0 世界观填入创意设定表单、Step 1-6 的 Markdown 文本被前端解析器
// 正确映射并写入后端各实体字段。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useInitializerStore } from '@/features/map/stores/initializerStore';
import { useBookDetailStore } from '@/app/(dashboard)/books/[id]/store';

// 动态 import 的 API 模块全部 mock，捕获调用参数
const worldApi = vi.hoisted(() => {
  let locSeq = 0;
  return {
    createLocation: vi.fn(async (b: unknown) => { locSeq += 1; return { ...(b as object), id: 200 + locSeq }; }),
    updateLocation: vi.fn(async (_id: number, _body: Record<string, unknown>) => ({})),
    createSceneEvent: vi.fn(async (b: unknown) => b),
    createForeshadowing: vi.fn(async (b: unknown) => b),
    createPlotThread: vi.fn(async (b: unknown) => b),
    fetchLocations: vi.fn(async () => [{ id: 7, name: '王都' }]),
    fetchSceneEvents: vi.fn(async () => []),
    fetchPlotThreads: vi.fn(async () => [{ id: 1, name: '主线' }, { id: 2, name: '宗门线索' }]),
    fetchForeshadowings: vi.fn(async () => []),
  };
});
const charactersApi = vi.hoisted(() => {
  let charSeq = 0;
  return {
    createCharacter: vi.fn(async (b: unknown) => { charSeq += 1; return { ...(b as object), id: 100 + charSeq }; }),
    updateCharacter: vi.fn(async (_id: number, _body: Record<string, unknown>) => ({})),
    fetchCharacters: vi.fn(async () => [{ id: 11, name: '林晚' }, { id: 12, name: '苏璃' }]),
  };
});
const booksApi = vi.hoisted(() => ({
  createVolume: vi.fn(async (_b: unknown, _title: string, _summary?: string) => ({ id: 100 })),
  createChapter: vi.fn(async (_v: unknown, _body: Record<string, unknown>) => ({ id: 200 })),
  updateCreativeSetting: vi.fn(async () => ({})),
  fetchChaptersTree: vi.fn(async () => [{ id: 100, title: '卷一', chapters: [{ id: 200, title: '第一章', sortOrder: 1 }] }]),
}));
const entityStoreApi = vi.hoisted(() => ({
  loadFromApi: vi.fn(async () => {}),
}));
const wizardApi = vi.hoisted(() => ({
  streamGenerateMarkdown: vi.fn(async () => ''),
}));

vi.mock('@/shared/api/world', () => worldApi);
vi.mock('@/shared/api/characters', () => charactersApi);
vi.mock('@/shared/api/books', () => booksApi);
vi.mock('@/features/map/stores/entityStore', () => ({
  useEntityStore: { getState: () => entityStoreApi },
}));
vi.mock('@/shared/api/wizard', () => wizardApi);

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
    stepText: {},
    savedSteps: new Set(),
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

  it('Step2 角色：Markdown 解析落库（别名/状态/自定义字段/首次出场/关系链）', async () => {
    setStepText(2, [
      '## 角色：萧尘 - 帝国三皇子，被流放至边疆',
      '类型：主角',
      '别名：三殿下、剑圣',
      '状态：金丹期散修·流放中',
      '首次出场：王都',
      '关系链：',
      '师徒 - 玄真道人：',
      '名义师徒，实为仇人',
      '敌对 - 苏璃：不死不休的宿敌',
      '自定义字段：',
      '功法：九天星辰诀',
      '武器：断念剑',
      '',
      '## 角色：玄真道人 - 隐居药谷的炼丹宗师',
      '类型：导师',
      '状态：隐居',
      '',
      '## 角色：店小二 - 客栈跑堂的伙计',
      '类型：龙套',
      '状态：见钱眼开',
    ].join('\n'));
    await useInitializerStore.getState().nextStep();
    // 三个角色全部创建（萧尘不在已有角色中）
    expect(charactersApi.createCharacter).toHaveBeenCalledTimes(3);
    const main = charactersApi.createCharacter.mock.calls[0][0] as Record<string, unknown>;
    expect(main.name).toBe('萧尘');
    expect(main.roleType).toBe('主角');
    expect(String(main.status)).toContain('流放');
    expect(main.spawnLocationId).toBe(7); // 首次出场 → 王都(已有 id 7)
    expect(main.aliases).toEqual(['三殿下', '剑圣']);
    expect(main.customFields).toMatchObject({ 功法: '九天星辰诀', 武器: '断念剑' });
    // 次要/龙套角色（店小二）无关系链 → 只创建不更新
    expect(charactersApi.updateCharacter).toHaveBeenCalledTimes(1);
    const patch = charactersApi.updateCharacter.mock.calls[0][1] as { relationshipChain: Array<{ targetId: number; type: string; description: string }> };
    expect(patch.relationshipChain).toHaveLength(2);
    expect(patch.relationshipChain[0]).toMatchObject({ targetId: 102, type: '师徒' }); // 玄真道人（本批 id 102）
    expect(patch.relationshipChain[1]).toMatchObject({ targetId: 12, type: '敌对' }); // 苏璃（已有 id 12）
    expect(String(patch.relationshipChain[0].description)).toContain('仇人'); // 多行续写合并
  });

  it('Step1 地点：Markdown 层级解析（父子关系/自定义字段/跳级降级/已存在跳过）', async () => {
    setStepText(1, [
      '# 地点：星辉大陆 - 漂浮于星海的广袤大陆',
      '类型：大陆',
      '自定义字段：',
      '势力：三大公会',
      '资源：星辰矿石',
      '',
      '## 地点：星辉城 - 大陆中枢王都',
      '类型：王都',
      '自定义字段：',
      '势力：皇族',
      '',
      '### 地点：晨曦宫 - 皇族居所',
      '类型：宫殿',
      '',
      '### 地点：斗兽场 - 血腥的竞技场',
      '类型：竞技场',
      '',
      '# 地点：王都 - 已存在应跳过',
      '类型：王都',
    ].join('\n'));
    await useInitializerStore.getState().nextStep();
    // 王都已存在（id 7）被跳过 → 仅创建 4 个新地点
    expect(worldApi.createLocation).toHaveBeenCalledTimes(4);
    const createdNames = worldApi.createLocation.mock.calls.map((c) => (c[0] as { name: string }).name);
    expect(createdNames).toEqual(['星辉大陆', '星辉城', '晨曦宫', '斗兽场']);
    // 自定义字段 → attributes
    const continent = worldApi.createLocation.mock.calls[0][0] as Record<string, unknown>;
    expect(continent.attributes).toMatchObject({ 势力: '三大公会', 资源: '星辰矿石' });
    // 父子关系按名字解析 parentId：晨曦宫(203)/斗兽场(204) → 星辉城(202)，星辉城(202) → 星辉大陆(201)
    expect(worldApi.updateLocation).toHaveBeenCalledTimes(3);
    const updates = worldApi.updateLocation.mock.calls;
    const parentOf = (id: number) => (updates.find((c) => c[0] === id)?.[1] as { parentId?: number })?.parentId;
    expect(parentOf(203)).toBe(202); // 晨曦宫 → 星辉城
    expect(parentOf(204)).toBe(202); // 斗兽场 → 星辉城
    expect(parentOf(202)).toBe(201); // 星辉城 → 星辉大陆
  });

  it('Step1 地点：标题跳级（### 无 ## 父级）降级为顶层，不设置 parentId', async () => {
    setStepText(1, [
      '# 地点：孤岛大陆 - 与世隔绝的荒芜之地',
      '类型：大陆',
      '',
      '### 地点：废弃灯塔 - 海边孤立的灯塔',
      '类型：灯塔',
    ].join('\n'));
    await useInitializerStore.getState().nextStep();
    // 两个地点都创建（栈 [2] 无记录 → 废弃灯塔 parentName undefined）
    expect(worldApi.createLocation).toHaveBeenCalledTimes(2);
    const updates = worldApi.updateLocation.mock.calls;
    // 废弃灯塔（id 202）不产生 parentId 更新
    const lighthouseUpdate = updates.find((c) => c[0] === 202);
    expect(lighthouseUpdate).toBeUndefined();
  });

  it('Step0 创意设定：Markdown 方案解析后填入表单', async () => {
    wizardApi.streamGenerateMarkdown.mockResolvedValue([
      '# 世界观方案：星辰纪元',
      '文风基调：史诗奇幻',
      '世界观：星辰之力驱动的世界',
      '写作禁忌：禁止现代科技',
      '自定义字段：',
      '战力体系：星辰等级制',
    ].join('\n'));
    useInitializerStore.setState({ currentStep: 0 });
    await useInitializerStore.getState().regenerateCandidates();
    const form = useInitializerStore.getState().creativeForm;
    expect(form.name).toBe('星辰纪元');
    expect(form.tone).toBe('史诗奇幻');
    expect(form.worldview).toBe('星辰之力驱动的世界');
    expect(form.taboos).toBe('禁止现代科技');
    expect(form.customFields).toContainEqual(expect.objectContaining({ key: '战力体系', value: '星辰等级制' }));
    // 生成结束后状态复位，可正常进入下一步
    expect(useInitializerStore.getState().generating).toBe(false);
    expect(useInitializerStore.getState().streaming).toBe(false);
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
