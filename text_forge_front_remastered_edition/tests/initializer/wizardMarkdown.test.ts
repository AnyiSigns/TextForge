// tests/initializer/wizardMarkdown.test.ts
// 初始化向导 Markdown 解析器纯单测：验证 Step 0 世界观 / Step 1 地点 / Step 2 角色 的解析契约。
import { describe, it, expect } from 'vitest';
import { parsePlotThreads, parseOutline, parseEvents, parseForeshadowings, parseLocations, parseCharacters, parseCreativeSetting, extractJsonBlocks, parseRef, parseStepJson } from '@/features/map/lib/wizardMarkdown';

describe('parseCreativeSetting（Step 0 世界观）', () => {
  it('方案标题 + 单行字段 + 自定义字段块', () => {
    const out = parseCreativeSetting([
      '# 世界观方案：星辰纪元',
      '文风基调：史诗奇幻、宏大叙事',
      '世界观：星辰之力驱动的奇幻世界',
      '写作禁忌：禁止现代科技；禁止降智反派',
      '自定义字段：',
      '战力体系：星辰等级制',
      '势力：三大公会',
    ].join('\n'));

    expect(out.name).toBe('星辰纪元');
    expect(out.tone).toBe('史诗奇幻、宏大叙事');
    expect(out.worldview).toBe('星辰之力驱动的奇幻世界');
    expect(out.taboos).toBe('禁止现代科技；禁止降智反派');
    expect(out.customFields).toEqual({ 战力体系: '星辰等级制', 势力: '三大公会' });
  });

  it('世界观/写作禁忌多行续写合并', () => {
    const out = parseCreativeSetting([
      '# 世界观方案：星辰纪元',
      '文风基调：史诗奇幻',
      '世界观：',
      '星辰之力驱动的奇幻世界。',
      '三大公会共治天下，星门遗迹遍布大陆。',
      '写作禁忌：',
      '禁止现代科技',
      '禁止降智反派',
      '自定义字段：',
      '战力体系：星辰等级制',
    ].join('\n'));

    expect(out.worldview).toContain('星辰之力驱动的奇幻世界');
    expect(out.worldview).toContain('三大公会共治天下');
    expect(out.taboos).toContain('禁止现代科技');
    expect(out.taboos).toContain('禁止降智反派');
    expect(out.customFields).toEqual({ 战力体系: '星辰等级制' });
  });

  it('空文本解析为空字段', () => {
    expect(parseCreativeSetting('')).toEqual({ name: '', tone: '', worldview: '', taboos: '', customFields: {} });
  });
});

describe('parseLocations（Step 1 地点）', () => {
  it('标题层级表达父子关系（多叉树：一父多子）', () => {
    const items = parseLocations([
      '# 地点：星辉大陆 - 漂浮于星海的广袤大陆',
      '类型：大陆',
      '',
      '## 地点：星辉城 - 大陆中枢王都',
      '类型：王都',
      '',
      '## 地点：青木森林 - 精灵领地',
      '类型：森林',
      '',
      '### 地点：晨曦宫 - 皇族居所',
      '类型：宫殿',
    ].join('\n'));

    expect(items).toHaveLength(4);
    expect(items[0]).toMatchObject({ name: '星辉大陆', type: '大陆', level: 1 });
    expect(items[0].parentName).toBeUndefined();
    expect(items[1].name).toBe('星辉城');
    expect(items[1].parentName).toBe('星辉大陆');
    // 一父多子：青木森林 与 星辉城 共享父级
    expect(items[2].name).toBe('青木森林');
    expect(items[2].parentName).toBe('星辉大陆');
    expect(items[3].name).toBe('晨曦宫');
    expect(items[3].parentName).toBe('青木森林');
    // 标题描述与名称分离
    expect(items[0].description).toContain('漂浮于星海');
  });

  it('孙孙级任意深度 + 跳级降级为顶层', () => {
    const items = parseLocations([
      '# 地点：世界 - 主世界',
      '类型：世界',
      '',
      '## 地点：大陆 - 主大陆',
      '类型：大陆',
      '',
      '### 地点：王国 - 人类王国',
      '类型：王国',
      '',
      '#### 地点：王宫 - 王座所在',
      '类型：宫殿',
      '',
      '### 地点：孤岛 - 无二级父级（跳级）',
      '类型：海岛',
    ].join('\n'));

    expect(items[0].parentName).toBeUndefined();
    expect(items[1].parentName).toBe('世界');
    expect(items[2].parentName).toBe('大陆');
    // 孙孙级（4 级标题）挂到最近的 3 级父
    expect(items[3].parentName).toBe('王国');
    // 跳级：### 越过一级后挂到最近可用上层（stack 里最近出现的 ## = 大陆）
    expect(items[4].name).toBe('孤岛');
    expect(items[4].parentName).toBe('大陆');
  });

  it('自定义字段块收集 + 内联 JSON', () => {
    const items = parseLocations([
      '# 地点：星辉城 - 中枢',
      '类型：王都',
      '自定义字段：',
      '势力：皇族',
      '人口：百万',
      '',
      '# 地点：秘境 - 内联 JSON',
      '类型：禁地',
      '自定义字段：{"灵气浓度":"极高","守卫":"九头蛇"}',
    ].join('\n'));

    expect(items[0].customFields).toEqual({ 势力: '皇族', 人口: '百万' });
    expect(items[1].customFields).toEqual({ 灵气浓度: '极高', 守卫: '九头蛇' });
  });
});

describe('parseCharacters（Step 2 角色）', () => {
  it('字段行解析（类型/别名/状态/首次出场/自定义字段）', () => {
    const items = parseCharacters([
      '## 角色：林晚 - 帝国三皇子，被流放至边疆',
      '类型：主角',
      '别名：三殿下、剑圣',
      '状态：金丹期散修·流放中',
      '首次出场：王都',
      '自定义字段：',
      '功法：九天星辰诀',
      '武器：断念剑',
    ].join('\n'));

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: '林晚',
      roleType: '主角',
      aliases: ['三殿下', '剑圣'],
      status: '金丹期散修·流放中',
      spawnLocationName: '王都',
    });
    expect(items[0].description).toContain('帝国三皇子');
    expect(items[0].customFields).toEqual({ 功法: '九天星辰诀', 武器: '断念剑' });
    expect(items[0].relationships).toEqual([]);
  });

  it('关系链多行续写合并描述 + 次要角色无关系链', () => {
    const items = parseCharacters([
      '## 角色：林晚 - 主角',
      '类型：主角',
      '关系链：',
      '师徒 - 玄真道人：',
      '名义师徒，实为仇人；玄真当年灭林晚满门',
      '敌对 - 血魔老祖：不死不休的宿敌',
      '',
      '## 角色：店小二 - 龙套',
      '类型：龙套',
      '状态：见钱眼开',
    ].join('\n'));

    expect(items).toHaveLength(2);
    expect(items[0].relationships).toHaveLength(2);
    expect(items[0].relationships[0]).toMatchObject({ type: '师徒', targetName: '玄真道人' });
    // 多行续写合并到同一条描述
    expect(items[0].relationships[0].description).toContain('名义师徒');
    expect(items[0].relationships[0].description).toContain('灭林晚满门');
    expect(items[0].relationships[1]).toMatchObject({ type: '敌对', targetName: '血魔老祖' });
    // 次要角色未写关系链
    expect(items[1].relationships).toEqual([]);
  });

  it('关系链块后自定义字段正常收集（块切换）', () => {
    const items = parseCharacters([
      '## 角色：林晚 - 主角',
      '类型：主角',
      '关系链：',
      '师徒 - 玄真道人：名义师徒，实为仇人',
      '自定义字段：',
      '功法：九天星辰诀',
    ].join('\n'));

    expect(items[0].relationships).toHaveLength(1);
    expect(items[0].customFields).toEqual({ 功法: '九天星辰诀' });
  });
});

describe('parsePlotThreads（Step 3 情节线）', () => {
  it('主线/子线层级与类型字段', () => {
    const items = parsePlotThreads([
      '# 线：主线 - 主角成长之路',
      '类型：主线',
      '',
      '## 线：宗门线 - 宗门内斗',
      '类型：支线',
      '',
      '# 线：暗线 - 上古真相',
      '类型：暗线',
    ].join('\n'));

    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ name: '主线', type: '主线', level: 1, parentName: undefined });
    expect(items[1]).toMatchObject({ name: '宗门线', type: '支线', level: 2, parentName: '主线' });
    expect(items[2]).toMatchObject({ name: '暗线', type: '暗线', level: 1, parentName: undefined });
    expect(items[0].description).toContain('主角成长之路');
  });
});

describe('parseOutline（Step 4 大纲）', () => {
  it('卷→章→场景节点（时间/地点/角色/情节线）', () => {
    const vols = parseOutline([
      '# 卷一：觉醒 - 主角觉醒的旅程',
      '',
      '## 第一章：初入江湖 - 踏上旅途',
      '',
      '### 场景：城门口 - 主角初入江湖',
      '时间：第一天清晨',
      '地点：王都',
      '角色：林晚、苏璃',
      '情节线：主线',
      '',
      '### 场景：试炼台 - 通过入门考核',
      '时间：第一天下午',
      '角色：林晚',
    ].join('\n'));

    expect(vols).toHaveLength(1);
    expect(vols[0].title).toBe('觉醒');
    expect(vols[0].summary).toContain('主角觉醒');
    expect(vols[0].chapters).toHaveLength(1);
    expect(vols[0].chapters[0].title).toBe('初入江湖');
    const scenes = vols[0].chapters[0].scenes;
    expect(scenes).toHaveLength(2);
    expect(scenes[0]).toMatchObject({
      title: '城门口',
      timeLabel: '第一天清晨',
      location: '王都',
      characters: ['林晚', '苏璃'],
      plotThreads: ['主线'],
    });
    expect(scenes[1].characters).toEqual(['林晚']);
  });
});

describe('parseEvents（Step 5 事件）', () => {
  it('事件字段行解析（章节/时间/地点/角色/情节线）', () => {
    const items = parseEvents([
      '## 事件：城门相遇 - 主角与神秘人擦肩而过',
      '章节：第一章',
      '时间：第一天清晨',
      '地点：王都',
      '角色：林晚、苏璃',
      '情节线：主线',
    ].join('\n'));

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: '城门相遇',
      chapterRef: '第一章',
      timeLabel: '第一天清晨',
      location: '王都',
      characters: ['林晚', '苏璃'],
      plotThreads: ['主线'],
    });
    expect(items[0].summary).toContain('擦肩而过');
  });
});

describe('parseForeshadowings（Step 6 伏笔）', () => {
  it('伏笔字段行解析（类型/角色/埋下事件/揭示建议）', () => {
    const items = parseForeshadowings([
      '# 伏笔：断剑之谜 - 断剑实为上古神器',
      '类型：身份谜团',
      '角色：林晚',
      '埋下事件：城门相遇',
      '揭示建议：第三卷决战前夕',
    ].join('\n'));

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      title: '断剑之谜',
      type: '身份谜团',
      characters: ['林晚'],
      relatedEvent: '城门相遇',
      revealTiming: '第三卷决战前夕',
    });
    expect(items[0].description).toContain('上古神器');
  });
});

describe('extractJsonBlocks / parseRef / parseStepJson（方案 A：Markdown 展示 + JSON 块落库）', () => {
  it('提取围栏 JSON 块（json 标记与无标记均识别，损坏块跳过）', () => {
    const text = [
      '# 地点：王都 - 都城',
      '',
      '```json',
      '{"locations": [{"name": "王都"}]}',
      '```',
      '```json',
      '{broken',
      '```',
      '```',
      '{"locations": [{"name": "星辉城"}]}',
      '```',
    ].join('\n');
    const blocks = extractJsonBlocks(text);
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({ locations: [{ name: '王都' }] });
    expect(blocks[1]).toEqual({ locations: [{ name: '星辉城' }] });
  });

  it('parseRef：纯名称与 [id] 名称', () => {
    expect(parseRef('王都')).toEqual({ name: '王都' });
    expect(parseRef('[7] 王都')).toEqual({ id: 7, name: '王都' });
    expect(parseRef('[ 12 ] 林晚')).toEqual({ id: 12, name: '林晚' });
    expect(parseRef('')).toEqual({ name: '' });
  });

  it('Step1 地点 JSON：parent 引用带 id，结构对齐 markdown 解析器', () => {
    const items = parseStepJson([
      '```json',
      '{"locations": [{"name": "星辉大陆", "type": "大陆", "description": "漂移大陆", "parent": null}, {"name": "王都", "type": "王都", "description": "都城", "parent": "[1] 星辉大陆"}]}',
      '```',
    ].join('\n'), 1);
    expect(items).toEqual([
      { name: '星辉大陆', type: '大陆', description: '漂移大陆', parentName: undefined, parentRefId: undefined, customFields: {} },
      { name: '王都', type: '王都', description: '都城', parentName: '星辉大陆', parentRefId: 1, customFields: {} },
    ]);
  });

  it('Step2 角色 JSON：spawnLocation/关系链目标带 id', () => {
    const items = parseStepJson([
      '```json',
      '{"characters": [{"name": "林晚", "roleType": "主角", "aliases": ["剑圣"], "status": "流放中", "spawnLocation": "[7] 王都", "description": "主角", "relationships": [{"type": "师徒", "targetName": "[11] 玄真道人", "description": "名义师徒"}], "customFields": {"功法": "九天星辰诀"}}]}',
      '```',
    ].join('\n'), 2) as unknown as Array<Record<string, unknown>>;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      name: '林晚',
      roleType: '主角',
      aliases: ['剑圣'],
      spawnLocationName: '王都',
      spawnLocationRefId: 7,
    });
    expect((items[0].relationships as unknown as Array<Record<string, unknown>>)[0]).toMatchObject({
      type: '师徒',
      targetName: '玄真道人',
      targetRefId: 11,
    });
  });

  it('Step3 情节线 JSON：parent 带 id → level 推导', () => {
    const items = parseStepJson([
      '```json',
      '{"plotThreads": [{"name": "主线", "type": "主线", "parent": null, "description": "成长"}, {"name": "宗门线", "type": "支线", "parent": "[1] 主线", "description": "内斗"}]}',
      '```',
    ].join('\n'), 3) as unknown as Array<Record<string, unknown>>;
    expect(items[0]).toMatchObject({ name: '主线', level: 1, parentName: undefined });
    expect(items[1]).toMatchObject({ name: '宗门线', level: 2, parentName: '主线', parentRefId: 1 });
  });

  it('Step4 大纲 JSON：多卷块收集（每卷一个 volume 对象）', () => {
    const text = [
      '## 第一章：初入江湖',
      '```json',
      '{"volume": {"title": "觉醒", "summary": "觉醒之旅", "chapters": [{"title": "初入江湖", "summary": "踏上旅途", "scenes": [{"title": "城门口", "timeLabel": "第一天清晨", "location": "[7] 王都", "characters": ["[11] 林晚"], "plotThreads": ["[1] 主线"]}]}]}}',
      '```',
      '```json',
      '{"volume": {"title": "风暴", "summary": "风暴来袭", "chapters": []}}',
      '```',
    ].join('\n');
    const vols = parseStepJson(text, 4) as unknown as Array<Record<string, unknown>>;
    expect(vols).toHaveLength(2);
    expect(vols[0]).toMatchObject({ title: '觉醒', summary: '觉醒之旅' });
    const scenes = (vols[0].chapters as unknown as Array<Record<string, unknown>>)[0].scenes as unknown as Array<Record<string, unknown>>;
    expect(scenes[0]).toMatchObject({
      location: '王都',
      locationRefId: 7,
      characters: ['林晚'],
      charactersRefIds: [11],
      plotThreads: ['主线'],
      plotThreadsRefIds: [1],
    });
    expect(vols[1]).toMatchObject({ title: '风暴' });
  });

  it('Step5 事件 JSON：章节引用带 id', () => {
    const items = parseStepJson([
      '```json',
      '{"events": [{"title": "城门相遇", "chapterRef": "[201] 初入江湖", "timeLabel": "清晨", "location": "[7] 王都", "characters": ["林晚"], "plotThreads": ["主线"], "summary": "相遇"}]}',
      '```',
    ].join('\n'), 5) as unknown as Array<Record<string, unknown>>;
    expect(items[0]).toMatchObject({
      title: '城门相遇',
      chapterRef: '初入江湖',
      chapterRefId: 201,
      location: '王都',
      locationRefId: 7,
    });
  });

  it('纯数字 id 引用（LLM 直接输出 id）→ refIds 提取、names 留空', () => {
    const items = parseStepJson([
      '```json',
      '{"events": [{"title": "城门相遇", "chapterRef": 201, "characters": [11, "苏璃"], "plotThreads": [1], "summary": "相遇"}]}',
      '```',
    ].join('\n'), 5) as unknown as Array<Record<string, unknown>>;
    expect(items[0]).toMatchObject({
      chapterRef: '',
      chapterRefId: 201,
      characters: ['苏璃'],
      charactersRefIds: [11],
      plotThreads: [],
      plotThreadsRefIds: [1],
    });
  });

  it('多 JSON 块合并（Step 5 事件拆两个块）', () => {
    const items = parseStepJson([
      '```json',
      '{"events": [{"title": "事件甲", "summary": "一"}]}',
      '```',
      '```json',
      '{"events": [{"title": "事件乙", "summary": "二"}]}',
      '```',
    ].join('\n'), 5) as unknown as Array<Record<string, unknown>>;
    expect(items).toHaveLength(2);
    expect(items[1].title).toBe('事件乙');
  });

  it('Step6 伏笔 JSON：埋下事件带 id + 原始类型', () => {
    const items = parseStepJson([
      '```json',
      '{"foreshadowings": [{"title": "断剑之谜", "description": "上古神器", "type": "身份谜团", "characters": ["林晚"], "relatedEvent": "[300] 城门相遇", "revealTiming": "第三卷"}]}',
      '```',
    ].join('\n'), 6) as unknown as Array<Record<string, unknown>>;
    expect(items[0]).toMatchObject({
      title: '断剑之谜',
      type: '身份谜团',
      relatedEvent: '城门相遇',
      relatedEventRefId: 300,
      revealTiming: '第三卷',
    });
  });

  it('无 JSON 块返回 null（调用方回退 markdown 解析）', () => {
    expect(parseStepJson('# 地点：王都 - 都城', 1)).toBeNull();
  });
});
