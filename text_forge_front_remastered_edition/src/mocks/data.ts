export interface MockBook {
  id: number;
  userId: number;
  title: string;
  description: string;
  genre: string;
  pinned: boolean;
  workflowId: string | null;
  totalWordGoal: number;
  currentWordCount: number;
  timeUnit: 'day' | 'year' | 'hour';
  epochLabel: string;
}

export interface MockVolume {
  id: number;
  bookId: number;
  title: string;
  summary: string;
  sortOrder: number;
}

export interface MockChapter {
  id: number;
  volumeId: number;
  title: string;
  summary: string;
  sortOrder: number;
  characterIds: number[];
  locked: boolean;
}

export interface MockSceneEvent {
  id: number;
  bookId: number;
  chapterId: number | null;
  title: string;
  content: string | null;
  sortOrder: number;
  eventType: 'scene' | 'event' | 'milestone';
  storyTs: number;
  storyLabel: string | null;
  locationId: number | null;
  characterIds: number[];
  locked: boolean;
}

export interface MockLocation {
  id: number;
  bookId: number;
  name: string;
  type: string;
  description: string;
  parentId: number | null;
  positionX: number | null;
  positionY: number | null;
  backgroundUrl: string | null;
  alternateOfId: number | null;
  mapIcon: string | null;
  attributes: Record<string, unknown>;
  locked: boolean;
}

export interface MockCharacter {
  id: number;
  bookId: number;
  name: string;
  aliases: string[];
  description: string;
  roleType: string;
  status: string;
  relationshipChain: Array<{ targetId: number; type: string; description: string }>;
  locked: boolean;
  avatarUrl: string | null;
  role_type: string;
  spawnLocationId: number | null;
  baseLocationId: number | null;
  customFields: Record<string, unknown>;
  userId: number;
}

export interface MockForeshadowing {
  id: number;
  bookId: number;
  description: string;
  status: string;
  plantedAtChapterId: number | null;
  resolvedAtChapterId: number | null;
  relatedCharacterIds: number[];
  relatedEventId: number | null;
  revealType: string;
  notes: string;
  locked: boolean;
}

export interface MockPlotThread {
  id: number;
  bookId: number;
  name: string;
  description: string;
  status: string;
  parentThreadId: number | null;
  type: string;
  relatedCharacterIds: number[];
  startChapterId: number | null;
  endChapterId: number | null;
  progressNote: string;
  locked: boolean;
}

export const MOCK_BOOK: MockBook = {
  id: 1,
  userId: 1,
  title: '星辰纪',
  description: '一个关于星辰之力的奇幻故事。少年林星辰在密室的意外发现中觉醒，踏上了探索星辰之力的旅程。暗影势力蠢蠢欲动，古老的预言正在应验。',
  genre: '奇幻',
  pinned: false,
  workflowId: null,
  totalWordGoal: 300000,
  currentWordCount: 0,
  timeUnit: 'day',
  epochLabel: '星历元年',
};

export const MOCK_VOLUMES: MockVolume[] = [
  { id: 1, bookId: 1, title: '卷一：星辰初现', summary: '主角觉醒星辰之力，踏上命运之路。', sortOrder: 1 },
  { id: 2, bookId: 1, title: '卷二：暗流涌动', summary: '暗影势力浮现，天澜星面临前所未有的危机。', sortOrder: 2 },
];

export const MOCK_CHAPTERS: MockChapter[] = [
  { id: 1, volumeId: 1, title: '第1章：觉醒', summary: '密室中的意外发现唤醒了沉睡的力量。', sortOrder: 1, characterIds: [1, 2, 3, 7], locked: false },
  { id: 2, volumeId: 1, title: '第2章：启程', summary: '告别故土，踏上未知的旅途。', sortOrder: 2, characterIds: [1, 2, 5], locked: false },
  { id: 3, volumeId: 2, title: '第3章：暗影', summary: '暗影势力悄然入侵，危机初现。', sortOrder: 3, characterIds: [1, 2, 4, 6], locked: false },
  { id: 4, volumeId: 2, title: '第4章：远征集结', summary: '各方势力汇聚，远征的准备正在进行。', sortOrder: 4, characterIds: [1, 3, 5, 7], locked: false },
  { id: 5, volumeId: 2, title: '第5章：决战前夕', summary: '决战的号角即将吹响，命运在此交汇。', sortOrder: 5, characterIds: [1, 2, 3, 4, 5, 6, 7, 8], locked: false },
];

export const MOCK_SCENE_EVENTS: MockSceneEvent[] = [
  { id: 1, bookId: 1, chapterId: 1, title: '密室觉醒', content: '林星辰在城主府密室中发现了一本古老的星图，触碰瞬间，星辰之力在他体内迸发。他的眼睛闪过星芒，命运的齿轮开始转动。', sortOrder: 1, eventType: 'milestone', storyTs: 2, storyLabel: '第二天深夜', locationId: 7, characterIds: [1], locked: false },
  { id: 2, bookId: 1, chapterId: 1, title: '命运之书', content: '北辰师父向林星辰展示了命运之书的残页，上面记载着星辰之主的预言。林星辰看到了自己的名字刻在星光之中。', sortOrder: 2, eventType: 'scene', storyTs: 5, storyLabel: '第五天正午', locationId: 6, characterIds: [1, 3], locked: false },
  { id: 3, bookId: 1, chapterId: 1, title: '城主召见', content: '云城主召见林星辰，告知云中城面临的威胁，并赠予他一枚星核护符。苏月在一旁默默注视着他。', sortOrder: 3, eventType: 'scene', storyTs: 8, storyLabel: '第八天清晨', locationId: 6, characterIds: [1, 2, 7], locked: false },
  { id: 4, bookId: 1, chapterId: 2, title: '告别', content: '林星辰在云中城的城门前与苏月道别。苏月将一条星尘项链系在他脖子上，约定重逢之日。', sortOrder: 1, eventType: 'scene', storyTs: 12, storyLabel: '第十二天黄昏', locationId: 5, characterIds: [1, 2], locked: false },
  { id: 5, bookId: 1, chapterId: 2, title: '偶遇铁心', content: '在东大陆的古道上，林星辰遇到了同样追寻星辰之力的铁心。两人不打不相识，最终结为同伴。', sortOrder: 2, eventType: 'scene', storyTs: 15, storyLabel: '第十五天午时', locationId: 4, characterIds: [1, 5], locked: false },
  { id: 6, bookId: 1, chapterId: 2, title: '离开东大陆', content: '林星辰和铁心乘上星舟，穿越云海，离开了东大陆。回首望去，云中城在云端若隐若现。', sortOrder: 3, eventType: 'event', storyTs: 18, storyLabel: '第十八天黎明', locationId: 4, characterIds: [1, 5], locked: false },
  { id: 7, bookId: 1, chapterId: 3, title: '暗影降临', content: '一股黑暗能量从暗影星方向涌来，吞噬了天澜星的外围防线。天空被暗紫色的能量笼罩。', sortOrder: 1, eventType: 'milestone', storyTs: 42, storyLabel: '第四十二天午夜', locationId: 11, characterIds: [4], locked: false },
  { id: 8, bookId: 1, chapterId: 3, title: '援军到来', content: '紫烟从天澜星的星门中走出，带来了星灵一族的援军。她告诉林星辰星辰之力的真正用法。', sortOrder: 2, eventType: 'scene', storyTs: 48, storyLabel: '第四十八天破晓', locationId: 3, characterIds: [1, 6, 8], locked: false },
  { id: 9, bookId: 1, chapterId: 3, title: '天澜裂痕', content: '暗影能量在天澜星的大气层撕开一道裂痕。星辰之力与暗影之力的碰撞引发了天地异象。', sortOrder: 3, eventType: 'scene', storyTs: 52, storyLabel: '第五十二天傍晚', locationId: 3, characterIds: [1, 3, 4, 6, 8], locked: false },
  { id: 10, bookId: 1, chapterId: 4, title: '远征准备', content: '云城主召集各路英雄，在城主府大殿中商议远征暗影星的计划。铁心负责训练士兵。', sortOrder: 1, eventType: 'scene', storyTs: 58, storyLabel: '第五十八天', locationId: 6, characterIds: [1, 5, 7], locked: false },
  { id: 11, bookId: 1, chapterId: 4, title: '星图解密', content: '北辰师父破解了星图中的最后一道封印，发现了通往暗影星的秘密捷径——星域之门。', sortOrder: 2, eventType: 'scene', storyTs: 63, storyLabel: '第六十三天', locationId: 6, characterIds: [1, 3], locked: false },
  { id: 12, bookId: 1, chapterId: 4, title: '星域之门', content: '星域之门在银河系的边缘开启。远征军穿过星门，直指暗影星。这是通向决战的第一步。', sortOrder: 3, eventType: 'milestone', storyTs: 68, storyLabel: '第六十八天', locationId: 2, characterIds: [1, 2, 3, 5, 6], locked: false },
  { id: 13, bookId: 1, chapterId: 5, title: '最终集结', content: '远征军在暗影星轨道外集结。林星辰站在旗舰舰桥上，注视着前方的黑暗行星。', sortOrder: 1, eventType: 'scene', storyTs: 78, storyLabel: '第七十八天', locationId: 11, characterIds: [1, 2, 3, 5, 6, 7, 8], locked: false },
  { id: 14, bookId: 1, chapterId: 5, title: '星辰显现', content: '决战中，林星辰体内的星辰之力完全释放，化作漫天星光。他的身体与星辰融为一体。', sortOrder: 2, eventType: 'scene', storyTs: 85, storyLabel: '第八十五天', locationId: 3, characterIds: [1, 4, 8], locked: false },
  { id: 15, bookId: 1, chapterId: 5, title: '决战前夕', content: '最后的战斗即将开始。暗夜的真身浮现——他曾经是星辰之力的上一任继承者。林星辰必须做出选择。', sortOrder: 3, eventType: 'milestone', storyTs: 88, storyLabel: '第八十八天', locationId: 11, characterIds: [1, 4], locked: false },
];

export const MOCK_LOCATIONS: MockLocation[] = [
  { id: 1, bookId: 1, name: '宇宙', type: '宇宙空间', description: '无垠的星海，无数星系在其中闪耀。故事的宇宙舞台。', parentId: null, positionX: 0.5, positionY: 0.5, backgroundUrl: null, alternateOfId: null, mapIcon: null, attributes: {}, locked: false },
  { id: 2, bookId: 1, name: '银河系', type: '星系', description: '天澜星所在的螺旋星系，拥有数千亿颗恒星。银心处藏有古老的星门。', parentId: 1, positionX: 0.55, positionY: 0.4, backgroundUrl: null, alternateOfId: null, mapIcon: null, attributes: {}, locked: false },
  { id: 3, bookId: 1, name: '天澜星', type: '行星', description: '一颗被海洋覆盖的蔚蓝行星，星辰之力的源头。大气层中常年闪烁着淡淡星光。', parentId: 2, positionX: 0.48, positionY: 0.52, backgroundUrl: null, alternateOfId: null, mapIcon: null, attributes: {}, locked: false },
  { id: 4, bookId: 1, name: '东大陆', type: '大陆', description: '天澜星最大的大陆，山川壮丽，云中城坐落于东部高原之上。星辰之力在此最为浓郁。', parentId: 3, positionX: 0.6, positionY: 0.45, backgroundUrl: null, alternateOfId: null, mapIcon: null, attributes: {}, locked: false },
  { id: 5, bookId: 1, name: '云中城', type: '城市', description: '东大陆的中心城市，建在高山之巅，常年云海环绕。城中有闻名世界的星辰学府。', parentId: 4, positionX: 0.5, positionY: 0.55, backgroundUrl: null, alternateOfId: null, mapIcon: null, attributes: {}, locked: false },
  { id: 6, bookId: 1, name: '城主府', type: '建筑', description: '云中城的权力中心，飞檐翘角，庄严宏伟。地下深处有古老的密室。', parentId: 5, positionX: 0.55, positionY: 0.35, backgroundUrl: null, alternateOfId: null, mapIcon: null, attributes: {}, locked: false },
  { id: 7, bookId: 1, name: '密室', type: '房间', description: '城主府地下深处的秘密房间，布满了古老的星图壁画。这里蕴藏着星辰之力的秘密。', parentId: 6, positionX: 0.5, positionY: 0.8, backgroundUrl: null, alternateOfId: null, mapIcon: null, attributes: {}, locked: false },
  { id: 8, bookId: 1, name: '清风客栈', type: '建筑', description: '云中城最古老的客栈，来往旅人歇脚之处。老板是个深藏不露的高人。', parentId: 5, positionX: 0.3, positionY: 0.6, backgroundUrl: null, alternateOfId: null, mapIcon: null, attributes: {}, locked: false },
  { id: 9, bookId: 1, name: '落日镇', type: '城镇', description: '东大陆西部的小镇，以壮丽的落日景观闻名。铁心的故乡。', parentId: 4, positionX: 0.2, positionY: 0.7, backgroundUrl: null, alternateOfId: null, mapIcon: null, attributes: {}, locked: false },
  { id: 10, bookId: 1, name: '西大陆', type: '大陆', description: '天澜星的另一片大陆，神秘而荒凉。古文明的遗迹散落其间。', parentId: 3, positionX: 0.2, positionY: 0.5, backgroundUrl: null, alternateOfId: null, mapIcon: null, attributes: {}, locked: false },
  { id: 11, bookId: 1, name: '暗影星', type: '行星', description: '与天澜星平行的黑暗行星。暗夜的老巢，暗影之力的源头。天空永远是暗紫色。', parentId: 2, positionX: 0.5, positionY: 0.6, backgroundUrl: null, alternateOfId: 3, mapIcon: null, attributes: {}, locked: false },
  { id: 12, bookId: 1, name: '遗忘星域', type: '星域', description: '银河系边缘的一片废弃星域，古老的星辰传送门藏匿于此。', parentId: 1, positionX: 0.75, positionY: 0.3, backgroundUrl: null, alternateOfId: null, mapIcon: null, attributes: {}, locked: false },
];

export const MOCK_CHARACTERS: MockCharacter[] = [
  { id: 1, bookId: 1, name: '林星辰', aliases: ['星辰', '小林'], description: '主角。云中城的少年，性格坚韧不拔。在密室中意外觉醒了远古的星辰之力，被预言为星辰之主。', roleType: '主角', status: '活跃', relationshipChain: [{ targetId: 2, type: '恋人', description: '与苏月青梅竹马，彼此深爱。' }, { targetId: 3, type: '师徒', description: '北辰是林星辰的导师。' }, { targetId: 4, type: '宿敌', description: '暗夜是林星辰命中的宿敌。' }, { targetId: 5, type: '战友', description: '铁心是最可靠的战友。' }], locked: false, avatarUrl: null, role_type: '主角', spawnLocationId: 7, baseLocationId: 6, customFields: {}, userId: 1 },
  { id: 2, bookId: 1, name: '苏月', aliases: ['月儿'], description: '女主角。云中城城主的女儿，温柔而坚强。自幼与林星辰一起长大，擅长星术治愈。', roleType: '女主角', status: '活跃', relationshipChain: [{ targetId: 1, type: '恋人', description: '与林星辰青梅竹马。' }], locked: false, avatarUrl: null, role_type: '女主角', spawnLocationId: 6, baseLocationId: 6, customFields: {}, userId: 1 },
  { id: 3, bookId: 1, name: '北辰', aliases: ['师父', '北辰先生'], description: '林星辰的导师。一位隐居在云中城的高人，掌握着星辰之力的古老知识。', roleType: '导师', status: '活跃', relationshipChain: [{ targetId: 1, type: '师徒', description: '北辰是林星辰的导师。' }], locked: false, avatarUrl: null, role_type: '导师', spawnLocationId: 6, baseLocationId: 6, customFields: {}, userId: 1 },
  { id: 4, bookId: 1, name: '暗夜', aliases: ['暗影之主'], description: '反派。暗影星的主宰，星辰之力上一任继承者。因执念而堕入黑暗。', roleType: '反派', status: '活跃', relationshipChain: [{ targetId: 1, type: '宿敌', description: '暗夜认为林星辰偷走了属于他的星辰之力。' }], locked: false, avatarUrl: null, role_type: '反派', spawnLocationId: 11, baseLocationId: 11, customFields: {}, userId: 1 },
  { id: 5, bookId: 1, name: '铁心', aliases: ['铁面', '铁哥'], description: '林星辰的战友。来自落日镇的年轻战士，为人豪爽仗义。擅长近身搏斗。', roleType: '战友', status: '活跃', relationshipChain: [{ targetId: 1, type: '战友', description: '与林星辰并肩作战。' }], locked: false, avatarUrl: null, role_type: '战友', spawnLocationId: 9, baseLocationId: 9, customFields: {}, userId: 1 },
  { id: 6, bookId: 1, name: '紫烟', aliases: ['星灵使'], description: '来自星灵一族的神秘女子。她知晓星辰之力的真正秘密，在天澜星最危急的时刻出现。', roleType: '女配角', status: '活跃', relationshipChain: [{ targetId: 1, type: '引导者', description: '紫烟引导林星辰发现星辰之力的真相。' }, { targetId: 8, type: '共鸣', description: '紫烟能与星灵沟通。' }], locked: false, avatarUrl: null, role_type: '女配角', spawnLocationId: 3, baseLocationId: 3, customFields: {}, userId: 1 },
  { id: 7, bookId: 1, name: '云城主', aliases: ['城主'], description: '云中城的城主，苏月的父亲。一位仁慈而睿智的统治者，暗中守护着星辰之力的秘密。', roleType: '配角', status: '活跃', relationshipChain: [{ targetId: 1, type: '恩人', description: '云城主一直暗中保护林星辰。' }, { targetId: 2, type: '父女', description: '苏月的父亲。' }], locked: false, avatarUrl: null, role_type: '配角', spawnLocationId: 6, baseLocationId: 6, customFields: {}, userId: 1 },
  { id: 8, bookId: 1, name: '星灵', aliases: ['星辰之灵'], description: '天澜星的意识体，星辰之力的化身。没有实体形态，以星光凝聚的形象出现。', roleType: '神秘存在', status: '沉睡/半醒', relationshipChain: [{ targetId: 1, type: '选中者', description: '星灵选中了林星辰。' }, { targetId: 6, type: '共鸣', description: '紫烟是少数能与星灵沟通的星灵使。' }], locked: false, avatarUrl: null, role_type: '神秘存在', spawnLocationId: 3, baseLocationId: 3, customFields: {}, userId: 1 },
];

export const MOCK_FORESHADOWINGS: MockForeshadowing[] = [
  { id: 1, bookId: 1, description: '密室壁画中的神秘符号——星图中央的第七颗星似乎暗指林星辰最终的命运。', status: 'planted', plantedAtChapterId: 1, resolvedAtChapterId: null, relatedCharacterIds: [1, 3], relatedEventId: 1, revealType: 'gradual', notes: '后续逐步揭示符号含义', locked: false },
  { id: 2, bookId: 1, description: '暗夜的真正身份——他曾是上一任星辰之力的继承者，因未能通过试炼而被星辰抛弃。', status: 'planted', plantedAtChapterId: 3, resolvedAtChapterId: null, relatedCharacterIds: [1, 4], relatedEventId: 7, revealType: 'twist', notes: '决战时揭晓', locked: false },
  { id: 3, bookId: 1, description: '星辰之力的代价——使用终极星辰之力将付出生命的代价。星灵的沉默暗示着更加残酷的真相。', status: 'planted', plantedAtChapterId: 5, resolvedAtChapterId: null, relatedCharacterIds: [1, 8], relatedEventId: 14, revealType: 'gradual', notes: '最终章揭晓', locked: false },
];

export const MOCK_PLOT_THREADS: MockPlotThread[] = [
  { id: 1, bookId: 1, name: '主角成长线', description: '林星辰从懵懂少年成长为星辰之主的过程，包含力量觉醒、情感纠葛和命运抉择。', status: 'ongoing', parentThreadId: null, type: 'main', relatedCharacterIds: [1, 2, 3], startChapterId: 1, endChapterId: null, progressNote: '主角已觉醒星辰之力，正在筹备远征', locked: false },
  { id: 2, bookId: 1, name: '暗影入侵线', description: '暗影势力对天澜星的入侵及其背后的阴谋。揭示暗夜与星辰之力的深层关联。', status: 'ongoing', parentThreadId: null, type: 'antagonist', relatedCharacterIds: [4, 6, 8], startChapterId: 3, endChapterId: null, progressNote: '暗影入侵已经开始，天澜裂痕正在扩大', locked: false },
];
