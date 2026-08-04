import { create } from 'zustand';
import { useEntityStore } from './entityStore';
import type { MockLocation, MockCharacter, MockSceneEvent } from '@/mocks/data';

interface Candidate {
  id: string;
  title: string;
  fields: Array<{ key: string; value: string }>;
}

const STEP_LABELS = [
  '世界观', '地点', '角色', '大纲', '事件', '情节线', '伏笔',
];

interface InitializerState {
  isOpen: boolean;
  currentStep: number;
  candidates: Candidate[][];
  lockedIds: Set<string>;
  confirmedIds: Set<string>;

  open: () => void;
  close: () => void;
  nextStep: () => void;
  prevStep: () => void;
  toggleLock: (step: number, candidateId: string) => void;
  toggleConfirm: (step: number, candidateId: string) => void;
  regenerateCandidates: () => void;
  finish: () => void;
}

function generateCandidates(step: number): Candidate[] {
  switch (step) {
    case 0:
      return [
        { id: 'w1', title: '星辰纪元', fields: [
          { key: '世界观', value: '一个由星辰之力驱动的奇幻世界，每个人的命运都与天上的星辰相连。星辰之力分为光明与暗影两系，光明系用于创造和治愈，暗影系用于破坏和控制。' },
          { key: '核心冲突', value: '光明与暗影的平衡正在被打破，远古的星辰之主预言即将应验。' },
        ]},
        { id: 'w2', title: '洪荒星域', fields: [
          { key: '世界观', value: '广袤的星域中，每个星球都有自己的文明和力量体系。星域之间通过古老的星门相连，只有掌握星辰之力的人才能够穿越。' },
          { key: '核心冲突', value: '星域之间的贸易和战争已经持续了千年，一股来自宇宙深处的未知力量正在接近。' },
        ]},
        { id: 'w3', title: '元素星海', fields: [
          { key: '世界观', value: '世界由金木水火土五大元素星组成，每颗星都有独特的生态和文明。元素之间的平衡维持着整个星海的稳定。' },
          { key: '核心冲突', value: '五大元素的力量开始失衡，火元素星的力量正在侵蚀其他星球的生态。' },
        ]},
        { id: 'w4', title: '机械星环', fields: [
          { key: '世界观', value: '一个科技与星辰之力共存的世界。机械文明在星环带上建立了庞大的城市，远古的星辰之力与先进科技形成了奇妙的共生关系。' },
          { key: '核心冲突', value: '科技联盟试图利用星辰之力控制整个星系，而保守派则誓死守护星辰之力的纯粹。' },
        ]},
      ];
    case 1:
      return [
        { id: 'l1', title: '云中城', fields: [
          { key: '类型', value: '城市' },
          { key: '描述', value: '建在高山云海之巅的古老城市，是星辰之力的发源地之一。' },
        ]},
        { id: 'l2', title: '暗影深渊', fields: [
          { key: '类型', value: '地下城' },
          { key: '描述', value: '隐藏在行星地壳深处的黑暗区域，暗影之力的源头。' },
        ]},
        { id: 'l3', title: '星门遗迹', fields: [
          { key: '类型', value: '遗迹' },
          { key: '描述', value: '远古文明留下的星际传送门遗址，通往未知的星域。' },
        ]},
        { id: 'l4', title: '星辰学府', fields: [
          { key: '类型', value: '建筑' },
          { key: '描述', value: '培养星辰使者的最高学府，坐落在天澜星最大的城市中心。' },
        ]},
      ];
    case 2:
      return [
        { id: 'c1', title: '星痕', fields: [
          { key: '角色类型', value: '孤儿剑客' },
          { key: '描述', value: '自幼失去双亲，被云中城的老剑客收养。左手掌心有一道神秘的星辰纹印。性格沉默寡言，但内心炽热。' },
        ]},
        { id: 'c2', title: '月璃', fields: [
          { key: '角色类型', value: '星辰学府的天才少女' },
          { key: '描述', value: '星辰学府最年轻的天才学员，精通光明系星辰之力。性格开朗活泼，但内心深处隐藏着不为人知的秘密。' },
        ]},
        { id: 'c3', title: '黑曜', fields: [
          { key: '角色类型', value: '暗影组织的首领' },
          { key: '描述', value: '暗影深渊的主宰者，一心想夺取星辰之力的全部力量。身世成谜，与主角之间似乎有某种未知的羁绊。' },
        ]},
        { id: 'c4', title: '玄老', fields: [
          { key: '角色类型', value: '隐世高人' },
          { key: '描述', value: '曾是天澜星最强的星辰使者，因某次大战后隐退。偶然发现了主角身上的星辰纹印，决定重新出山。' },
        ]},
      ];
    case 3:
      return [
        { id: 'o1', title: '三卷结构', fields: [
          { key: '大纲', value: '卷一：觉醒篇 - 主角发现星辰之力，进入星辰学府学习\n卷二：成长篇 - 在修行中逐渐揭开身世之谜\n卷三：决战篇 - 光明与暗影的最终对决' },
        ]},
        { id: 'o2', title: '双线叙事', fields: [
          { key: '大纲', value: '明线：主角在星辰学府的修炼成长\n暗线：暗影组织在各星域的渗透行动\n双线在星门遗迹发现时交汇' },
        ]},
        { id: 'o3', title: '章节划分', fields: [
          { key: '大纲', value: '第一章：星辰初现 - 主角意外觉醒\n第二章：入学试炼 - 进入星辰学府\n第三章：星门之谜 - 发现远古遗迹\n第四章：暗影浮现 - 暗影组织现身' },
        ]},
      ];
    case 4:
      return [
        { id: 'e1', title: '星辰觉醒', fields: [
          { key: '时间', value: 'Day 1' },
          { key: '地点', value: '云中城' },
          { key: '描述', value: '主角在老剑客的小屋中第一次触碰到星辰之力，左手的纹印发出了耀眼的星光。' },
        ]},
        { id: 'e2', title: '入学试炼', fields: [
          { key: '时间', value: 'Day 15' },
          { key: '地点', value: '星辰学府' },
          { key: '描述', value: '入学测试中，主角展现出了惊人的天赋，引起了学府高层的注意。' },
        ]},
        { id: 'e3', title: '星门开启', fields: [
          { key: '时间', value: 'Day 45' },
          { key: '地点', value: '星门遗迹' },
          { key: '描述', value: '主角在星门遗迹中找到了远古文明留下的星辰之书，揭开了星门的真正秘密。' },
        ]},
        { id: 'e4', title: '暗影来袭', fields: [
          { key: '时间', value: 'Day 60' },
          { key: '地点', value: '星辰学府' },
          { key: '描述', value: '暗影组织袭击星辰学府，主角在战斗中觉醒了完整的星辰之力。' },
        ]},
      ];
    case 5:
      return [
        { id: 'p1', title: '主角成长线', fields: [
          { key: '类型', value: '主线' },
          { key: '描述', value: '从孤儿少年成长为星辰之主。关键节点：觉醒→学府修炼→星门启程→决战觉醒→统治星域。' },
        ]},
        { id: 'p2', title: '暗影阴谋线', fields: [
          { key: '类型', value: '暗线' },
          { key: '描述', value: '暗影组织的渗透计划。揭示黑曜与主角之间的深层关联，以及暗影组织的真实目的。' },
        ]},
      ];
    case 6:
      return [
        { id: 'f1', title: '星辰纹印的秘密', fields: [
          { key: '伏笔类型', value: '身份谜团' },
          { key: '内容', value: '主角掌心的星辰纹印究竟是谁留下的？它与远古星辰之主有什么关联？' },
          { key: '揭示时机', value: '卷三中期' },
        ]},
        { id: 'f2', title: '月璃的身世', fields: [
          { key: '伏笔类型', value: '隐藏身份' },
          { key: '内容', value: '月璃的真实身份是暗影组织前任首领的女儿，她进入星辰学府是为了赎罪。' },
          { key: '揭示时机', value: '卷二结尾' },
        ]},
        { id: 'f3', title: '消失的星辰之主', fields: [
          { key: '伏笔类型', value: '世界奥秘' },
          { key: '内容', value: '上一任星辰之主为何突然消失在历史中？他的力量去了哪里？' },
          { key: '揭示时机', value: '卷三结尾' },
        ]},
      ];
    default:
      return [];
  }
}

export const useInitializerStore = create<InitializerState>((set, get) => ({
  isOpen: false,
  currentStep: 0,
  candidates: Array.from({ length: 7 }, (_, i) => generateCandidates(i)),
  lockedIds: new Set<string>(),
  confirmedIds: new Set<string>(),

  open: () => set({ isOpen: true, currentStep: 0 }),

  close: () => set({ isOpen: false }),

  nextStep: () => {
    const { currentStep, candidates, lockedIds } = get();
    if (currentStep < 6) {
      const confirmedInStep = candidates[currentStep]
        .filter((c) => lockedIds.has(c.id))
        .map((c) => c.id);
      const newConfirmed = new Set(get().confirmedIds);
      confirmedInStep.forEach((id) => newConfirmed.add(id));
      set({ currentStep: currentStep + 1, confirmedIds: newConfirmed });
    }
  },

  prevStep: () => {
    const { currentStep } = get();
    if (currentStep > 0) set({ currentStep: currentStep - 1 });
  },

  toggleLock: (step, candidateId) => {
    const newLocked = new Set(get().lockedIds);
    if (newLocked.has(candidateId)) {
      newLocked.delete(candidateId);
    } else {
      newLocked.add(candidateId);
    }
    set({ lockedIds: newLocked });
  },

  toggleConfirm: (step, candidateId) => {
    const newConfirmed = new Set(get().confirmedIds);
    if (newConfirmed.has(candidateId)) {
      newConfirmed.delete(candidateId);
    } else {
      newConfirmed.add(candidateId);
    }
    set({ confirmedIds: newConfirmed });
  },

  regenerateCandidates: () => {
    const { currentStep } = get();
    const newCandidates = [...get().candidates];
    newCandidates[currentStep] = generateCandidates(currentStep);
    set({ candidates: newCandidates });
  },

  finish: () => {
    const { candidates, lockedIds, confirmedIds } = get();
    const entityStore = useEntityStore.getState();

    // Step 1: 世界观 → 暂无直接实体，作为 book description
    const wCandidates = candidates[0].filter((c) => lockedIds.has(c.id) || confirmedIds.has(c.id));
    if (wCandidates.length > 0 && entityStore.book) {
      const summary = wCandidates.map((c) => c.fields.map((f) => f.value).join('\n')).join('\n\n');
      // Books don't have a formal worldview field, store in description for now
    }

    // Step 1: 地点 → addLocation
    const lCandidates = candidates[1].filter((c) => lockedIds.has(c.id) || confirmedIds.has(c.id));
    let nextLocId = entityStore.locations.length + 1;
    for (const c of lCandidates) {
      const type = c.fields.find((f) => f.key === '类型')?.value ?? '城镇';
      const desc = c.fields.find((f) => f.key === '描述')?.value ?? '';
      const loc: MockLocation = {
        id: nextLocId++,
        bookId: 1,
        name: c.title,
        type,
        description: desc,
        parentId: 1, // attach to root
        positionX: 0.3 + Math.random() * 0.4,
        positionY: 0.3 + Math.random() * 0.4,
        backgroundUrl: null,
        alternateOfId: null,
        mapIcon: null,
        attributes: {},
        locked: false,
      };
      entityStore.addLocation(loc);
    }

    // Step 2: 角色 → addCharacter
    const cCandidates = candidates[2].filter((c) => lockedIds.has(c.id) || confirmedIds.has(c.id));
    let nextChId = entityStore.characters.length + 1;
    for (const c of cCandidates) {
      const roleType = c.fields.find((f) => f.key === '角色类型')?.value ?? '配角';
      const desc = c.fields.find((f) => f.key === '描述')?.value ?? '';
      const ch: MockCharacter = {
        id: nextChId++,
        bookId: 1,
        name: c.title,
        aliases: [],
        description: desc,
        roleType,
        status: '活跃',
        relationshipChain: [],
        locked: false,
        avatarUrl: null,
        role_type: roleType,
        spawnLocationId: null,
        baseLocationId: null,
        customFields: {},
        userId: 1,
      };
      entityStore.addCharacter(ch);
    }

    // Step 4: 事件 → addSceneEvent
    const eCandidates = candidates[4].filter((c) => lockedIds.has(c.id) || confirmedIds.has(c.id));
    let nextEvId = entityStore.sceneEvents.length + 1;
    for (const c of eCandidates) {
      const desc = c.fields.find((f) => f.key === '描述')?.value ?? '';
      const timeStr = c.fields.find((f) => f.key === '时间')?.value?.replace('Day ', '') ?? `${60 + nextEvId * 10}`;
      const ev: MockSceneEvent = {
        id: nextEvId++,
        bookId: 1,
        chapterId: null,
        title: c.title,
        content: desc,
        sortOrder: nextEvId,
        eventType: 'scene',
        storyTs: parseFloat(timeStr) || 100,
        storyLabel: timeStr.includes('Day') ? `第${timeStr}天` : null,
        locationId: null,
        characterIds: [],
        locked: false,
      };
      entityStore.addSceneEvent(ev);
    }

    set({ isOpen: false });
  },
}));

export { STEP_LABELS };
export type { Candidate };
