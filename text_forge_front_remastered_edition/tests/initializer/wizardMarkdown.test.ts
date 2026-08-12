// tests/initializer/wizardMarkdown.test.ts
// 初始化向导 Markdown 解析器纯单测：验证 Step 0 世界观 / Step 1 地点 / Step 2 角色 的解析契约。
import { describe, it, expect } from 'vitest';
import { parseLocations, parseCharacters, parseCreativeSetting } from '@/features/map/lib/wizardMarkdown';

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
