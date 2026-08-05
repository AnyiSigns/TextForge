import { create } from 'zustand';
import { useEntityStore } from './entityStore';

interface Candidate {
  id: string;
  title: string;
  fields: Array<{ key: string; value: string }>;
}

const STEP_LABELS = [
  '世界观', '地点', '角色', '情节线', '大纲', '事件', '伏笔',
];

interface InitializerState {
  isOpen: boolean;
  currentStep: number;
  candidates: Candidate[][];
  lockedIds: Set<string>;
  confirmedIds: Set<string>;
  saving: boolean;
  error: string | null;
  generating: boolean;
  creativeForm: { name: string; tone: string; worldview: string; taboos: string; customFields: Array<{ key: string; value: string }> };

  open: () => void;
  close: () => void;
  nextStep: () => Promise<void>;
  prevStep: () => void;
  toggleLock: (step: number, candidateId: string) => void;
  toggleConfirm: (step: number, candidateId: string) => void;
  setCreativeForm: (data: Partial<InitializerState['creativeForm']>) => void;
  regenerateCandidates: () => Promise<void>;
  finish: () => Promise<void>;
  clearError: () => void;
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
        { id: 'p1', title: '主角成长线', fields: [
          { key: '类型', value: '主线' },
          { key: '描述', value: '从孤儿少年成长为星辰之主。关键节点：觉醒→学府修炼→星门启程→决战觉醒→统治星域。' },
        ]},
        { id: 'p2', title: '暗影阴谋线', fields: [
          { key: '类型', value: '暗线' },
          { key: '描述', value: '暗影组织的渗透计划。揭示黑曜与主角之间的深层关联，以及暗影组织的真实目的。' },
        ]},
      ];
    case 4:
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
    case 5:
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

interface InitError extends Error {
  step?: string;
}

/**
 * 将锁定的卡片批量写入后端。
 */
async function saveLockedCards(
  bookId: number,
  step: number,
  cards: Candidate[],
): Promise<void> {
  console.log(`[wizard:store] saveLockedCards step=${step} count=${cards.length}`);
  if (step === 1) {
    // 地点
    const { createLocation } = await import('@/shared/api/world');
    const results = await Promise.all(cards.map(async (c) => {
      const type = c.fields.find((f) => f.key === '类型')?.value ?? '城镇';
      const desc = c.fields.find((f) => f.key === '描述')?.value ?? '';
      const body = { bookId, name: c.title, type, description: desc };
      console.log(`[wizard:store] createLocation body=`, body);
      const result = await createLocation(body as Parameters<typeof createLocation>[0]);
      console.log(`[wizard:store] createLocation result=`, result);
      return result;
    }));
    console.log(`[wizard:store] saveLockedCards locations done`, results);
  } else if (step === 2) {
    // 角色
    const { createCharacter } = await import('@/shared/api/characters');
    await Promise.all(cards.map((c) => {
      const roleType = c.fields.find((f) => f.key === '角色类型')?.value ?? '配角';
      const desc = c.fields.find((f) => f.key === '描述')?.value ?? '';
      return createCharacter({ bookId, name: c.title, description: desc, roleType, status: '活跃' } as Parameters<typeof createCharacter>[0]);
    }));
  } else if (step === 3) {
    // 情节线
    const { createPlotThread } = await import('@/shared/api/world');
    await Promise.all(cards.map((c) => {
      const type = c.fields.find((f) => f.key === '类型')?.value ?? '支线';
      const desc = c.fields.find((f) => f.key === '描述')?.value ?? '';
      return createPlotThread({ bookId, name: c.title, description: desc, status: 'active', type } as Parameters<typeof createPlotThread>[0]);
    }));
  } else if (step === 4) {
    // 大纲 → 卷+章
    const { createVolume, createChapter } = await import('@/shared/api/books');
    for (const c of cards) {
      const text = c.fields.find((f) => f.key === '大纲')?.value ?? '';
      const volMatches = text.match(/卷[一二三四五六七八九十\d]+[：:][^\n]+/g) || [];
      for (let vi = 0; vi < volMatches.length; vi++) {
        const volTitle = volMatches[vi].replace(/[\n\r]/g, ' ').slice(0, 100);
        const createdVol = await createVolume(bookId, volTitle, '');
        const chMatches = text.match(/第[一二三四五六七八九十\d]+章[：:][^\n]+/g) || [];
        const chPerVol = Math.max(1, Math.ceil(chMatches.length / Math.max(1, volMatches.length)));
        const volChapters = chMatches.slice(vi * chPerVol, (vi + 1) * chPerVol);
        await Promise.all(volChapters.map((chTitle) =>
          createChapter(createdVol.id, { title: chTitle.replace(/[\n\r]/g, ' ').slice(0, 200), summary: '' } as Parameters<typeof createChapter>[1]),
        ));
      }
    }
  } else if (step === 5) {
    // 事件
    const { createSceneEvent } = await import('@/shared/api/world');
    await Promise.all(cards.map((c) => {
      const desc = c.fields.find((f) => f.key === '描述')?.value ?? '';
      return createSceneEvent({ bookId, title: c.title, content: desc, eventType: 'scene', sortOrder: 0 } as Parameters<typeof createSceneEvent>[0]);
    }));
  } else if (step === 6) {
    // 伏笔
    const { createForeshadowing } = await import('@/shared/api/world');
    await Promise.all(cards.map((c) => {
      const desc = c.fields.find((f) => f.key === '内容')?.value ?? c.title;
      const revealType = c.fields.find((f) => f.key === '伏笔类型')?.value ?? '身份谜团';
      return createForeshadowing({ bookId, description: desc, status: 'planted', revealType } as Parameters<typeof createForeshadowing>[0]);
    }));
  }
}

export const useInitializerStore = create<InitializerState>((set, get) => ({
  isOpen: false,
  currentStep: 0,
  candidates: Array.from({ length: 7 }, (_, i) => generateCandidates(i)),
  lockedIds: new Set<string>(),
  confirmedIds: new Set<string>(),
  saving: false,
  error: null,
  generating: false,
  creativeForm: { name: '', tone: '', worldview: '', taboos: '', customFields: [{ key: '战力体系', value: '' }, { key: '势力', value: '' }, { key: '交易单位', value: '' }] },

  open: () => set({ isOpen: true, currentStep: 0, saving: false, error: null }),

  close: () => set({ isOpen: false, saving: false, error: null }),

  nextStep: async () => {
    const { currentStep, candidates, lockedIds, creativeForm } = get();
    if (currentStep < 6) {
      // Step 0 → Step 1: 后台保存创意设定（不阻塞 UI）
      if (currentStep === 0) {
        const bookId = (await import('@/app/(dashboard)/books/[id]/store')).useBookDetailStore.getState().bookId;
        if (bookId && creativeForm.worldview) {
          const { updateCreativeSetting } = await import('@/shared/api/books');
          updateCreativeSetting(bookId, {
            tone: creativeForm.tone,
            worldview: creativeForm.worldview,
            writingTaboos: creativeForm.taboos,
            customDimensions: Object.fromEntries(
              creativeForm.customFields.filter((f) => f.key && f.value).map((f) => [f.key, f.value]),
            ),
          }).catch(() => {});
        }
      }

      // 卡片步骤（1-6）：锁定卡片写入后端
      if (currentStep >= 1 && currentStep <= 6) {
        const lockedCards = candidates[currentStep].filter((c) => lockedIds.has(c.id));
        console.log(`[wizard:store] nextStep step=${currentStep} lockedCards=${lockedCards.length}`, lockedCards.map(c => c.title));
        if (lockedCards.length > 0) {
          const bookId = (await import('@/app/(dashboard)/books/[id]/store')).useBookDetailStore.getState().bookId;
          console.log(`[wizard:store] nextStep saving bookId=${bookId}`);
          if (bookId) {
            try {
              await saveLockedCards(bookId, currentStep, lockedCards);
              console.log(`[wizard:store] nextStep save OK, reloading entityStore`);
              await useEntityStore.getState().loadFromApi(bookId);
            } catch (e) {
              console.error(`[wizard:store] nextStep save FAILED`, e);
            }
            // 保存后移除已入库卡片，回退再前进不会重复
            const savedIds = new Set(lockedCards.map((c) => c.id));
            const newCandidates = [...get().candidates];
            newCandidates[currentStep] = newCandidates[currentStep].filter((c) => !savedIds.has(c.id));
            // 同时清理 lockedIds
            const newLocked = new Set(get().lockedIds);
            savedIds.forEach((id) => newLocked.delete(id));
            set({ candidates: newCandidates, lockedIds: newLocked });
          }
        }
      }

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

  setCreativeForm: (data) => {
    set((s) => ({ creativeForm: { ...s.creativeForm, ...data } }));
  },

  regenerateCandidates: async () => {
    const { currentStep, candidates, lockedIds, confirmedIds, creativeForm } = get();
    const { useBookDetailStore } = await import('@/app/(dashboard)/books/[id]/store');
    const bookId = useBookDetailStore.getState().bookId;
    if (!bookId) {
      set({ error: '未找到当前书籍' });
      return;
    }

    // 收集前序步骤中 locked/confirmed 的卡片
    const previousCards: Array<{ step: number; title: string; fields: Array<{ key: string; value: string }> }> = [];
    for (let s = 0; s < currentStep; s++) {
      for (const c of candidates[s]) {
        if (lockedIds.has(c.id) || confirmedIds.has(c.id)) {
          previousCards.push({ step: s, title: c.title, fields: c.fields });
        }
      }
    }

    console.log(`[wizard:store] step=${currentStep} previousCards=${JSON.stringify(previousCards.map(p => ({ step: p.step, title: p.title })))}`);

    // 当前步已锁定的标题，传给后端避免重复生成
    const excludeTitles = candidates[currentStep]
      .filter((c) => lockedIds.has(c.id) || confirmedIds.has(c.id))
      .map((c) => c.title);

    set({ generating: true, error: null });
    try {
      const { generateWizardCards } = await import('@/shared/api/wizard');
      const cards = await generateWizardCards(bookId, currentStep, previousCards, excludeTitles);

      // Step 0: 取第一个卡片填入表单
      if (currentStep === 0 && cards.length > 0) {
        const first = cards[0];
        const form = get().creativeForm;
        const name = first.title || '';
        const tone = first.fields.find((f) => f.key === '文风基调')?.value ?? '';
        const worldview = first.fields.find((f) => f.key === '世界观')?.value ?? '';
        const taboos = first.fields.find((f) => f.key === '写作禁忌')?.value ?? '';
        const customRaw = first.fields.find((f) => f.key === '自定义维度')?.value ?? '';

        let customFields: Array<{ key: string; value: string }> = [];
        try {
          const parsed = JSON.parse(customRaw);
          if (Array.isArray(parsed)) {
            customFields = parsed.map((x: Record<string, string>) => ({ key: x.key || '', value: x.value || '' }));
          }
        } catch {
          // 文本格式："键：值" 每行
          customFields = customRaw
            .split('\n')
            .map((line) => {
              const idx = line.indexOf('：') >= 0 ? line.indexOf('：') : line.indexOf(':');
              if (idx >= 0) return { key: line.slice(0, idx).trim(), value: line.slice(idx + 1).trim() };
              return null;
            })
            .filter((x): x is { key: string; value: string } => x !== null && x.key.length > 0);
        }
        set({
          generating: false,
          creativeForm: { name, tone, worldview, taboos, customFields: customFields.length > 0 ? customFields : form.customFields },
        });
        return;
      }

      const mapped: Candidate[] = cards.map((c, i) => ({
        id: `${currentStep}-ai-${Date.now()}-${i}`,
        title: c.title,
        fields: c.fields,
      }));

      const newCandidates = [...get().candidates];
      // 保留已锁定/确认的卡片，新生成的追加到末尾
      const kept = newCandidates[currentStep].filter(
        (c) => lockedIds.has(c.id) || confirmedIds.has(c.id),
      );
      newCandidates[currentStep] = [...kept, ...mapped];
      set({ candidates: newCandidates, generating: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'AI 生成失败，请检查模型配置后重试';
      set({ generating: false, error: msg });
    }
  },

  clearError: () => set({ error: null }),

  finish: async () => {
    const { candidates, lockedIds, confirmedIds, currentStep } = get();
    const { useBookDetailStore } = await import('@/app/(dashboard)/books/[id]/store');
    const bookId = useBookDetailStore.getState().bookId;

    if (!bookId) {
      set({ error: '未找到当前书籍' });
      return;
    }

    set({ saving: true, error: null });

    try {
      // 保存当前步骤剩余的锁定卡片（之前步骤已在 nextStep 中保存）
      const lockedCards = candidates[currentStep].filter(
        (c) => lockedIds.has(c.id) || confirmedIds.has(c.id),
      );
      if (lockedCards.length > 0) {
        await saveLockedCards(bookId, currentStep, lockedCards);
      }

      await useEntityStore.getState().loadFromApi(bookId);
      set({ isOpen: false, saving: false });
    } catch (e) {
      const msg = e instanceof Error ? e.message : '保存失败';
      set({ saving: false, error: msg });
    }
  },
}));

export { STEP_LABELS };
export type { Candidate };
