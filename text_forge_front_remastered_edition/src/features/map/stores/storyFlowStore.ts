import { create } from 'zustand';

interface Decision {
  id: number;
  sceneTitle: string;
  chosenOption: string;
  timestamp: number;
}

interface SceneNode {
  id: number;
  title: string;
  narration: string;
  options: SceneOption[];
  locationName?: string;
  characters?: string[];
}

interface SceneOption {
  id: string;
  text: string;
  nextSceneId: number | null;
}

type Perspective = 'first' | 'third';

interface StoryFlowState {
  isOpen: boolean;
  currentSceneId: number;
  perspective: Perspective;
  decisionChain: Decision[];
  triggerChapterId: number | null;

  open: (chapterId: number) => void;
  close: () => void;
  setPerspective: (p: Perspective) => void;
  makeDecision: (optionId: string, optionText: string) => void;
  getCurrentScene: () => SceneNode | null;
}

const MOCK_SCENES: SceneNode[] = [
  {
    id: 1,
    title: '密室觉醒',
    locationName: '城主府·密室',
    characters: ['林星辰'],
    narration: '密室中弥漫着古老的气息。林星辰的手指触碰到那本泛黄的星图时，掌心突然传来一阵灼热。星辰纹印发出了微弱的星光，映照在密室的石壁上，那些古老的壁画仿佛活了过来，讲述着一段被遗忘的历史。',
    options: [
      { id: '1a', text: '仔细研究壁画上的内容', nextSceneId: 2 },
      { id: '1b', text: '尝试引动体内的星辰之力', nextSceneId: 3 },
      { id: '1c', text: '小心地将星图收好，退出密室', nextSceneId: 4 },
    ],
  },
  {
    id: 2,
    title: '壁画之谜',
    locationName: '城主府·密室',
    characters: ['林星辰'],
    narration: '你凑近壁画，发现上面描绘的是一场旷世大战。一位身披星光的身影正与一个被暗影包裹的人形战斗。在壁画的右下角，你看到了与自己掌心一模一样的星辰纹印。这一刻，你意识到自己的命运与这场远古之战紧密相连。',
    options: [
      { id: '2a', text: '默记壁画内容，回去请教北辰师父', nextSceneId: 5 },
      { id: '2b', text: '尝试用星辰之力激活壁画的其他部分', nextSceneId: 3 },
    ],
  },
  {
    id: 3,
    title: '星辰之力初现',
    locationName: '城主府·密室',
    characters: ['林星辰'],
    narration: '你闭上眼睛，按照直觉引导体内的那股温热能量。掌心纹印迸发出璀璨的星光，整个密室被照得如同白昼。石壁上的壁画开始旋转，一道由星光组成的门扉在密室中央缓缓打开。门的那边，是无垠的星海。',
    options: [
      { id: '3a', text: '踏入星光之门', nextSceneId: 6 },
      { id: '3b', text: '先退出密室，找北辰师父商议', nextSceneId: 5 },
    ],
  },
  {
    id: 4,
    title: '谨慎行事',
    locationName: '城主府·走廊',
    characters: ['林星辰'],
    narration: '你将星图小心翼翼地收入怀中，退出了密室。走廊里空无一人，但你的心跳依然很快。刚才的体验太过真实，你确定那不是幻觉。在走廊拐角处，你遇到了正在寻你的苏月——她的眼神中似乎藏着什么。',
    options: [
      { id: '4a', text: '把密室的发现告诉苏月', nextSceneId: 7 },
      { id: '4b', text: '暂时保密，独自调查', nextSceneId: 5 },
    ],
  },
  {
    id: 5,
    title: '北辰师父的指点',
    locationName: '云中城·书房',
    characters: ['林星辰', '北辰'],
    narration: '你将密室的发现告诉了北辰师父。老人听完后沉默了很久，然后从书架上取出了一本和你手中星图一模一样封面的古书——只是更加残破。\n\n「这就是命运之书。」北辰说到，「它记载着每一任星辰之主的预言。而你手中的，是最后一页。」',
    options: [
      { id: '5a', text: '询问星辰之主的命运是什么', nextSceneId: 8 },
      { id: '5b', text: '表达自己不愿承担这份责任', nextSceneId: 9 },
      { id: '5c', text: '下定决心要成为星辰之主', nextSceneId: 10 },
    ],
  },
  {
    id: 6,
    title: '星海彼岸',
    locationName: '星海空间',
    characters: ['林星辰', '星灵'],
    narration: '穿过星光之门，你来到了一个奇异的空间。脚下是无尽的星河，头顶是旋转的星云。在这片星海的中心，一个由星光凝聚而成的人形缓缓向你走来。\n\n「被选中者，终于等到你了。」它的声音在意识中回荡。',
    options: [
      { id: '6a', text: '问它："你是谁？为什么选中我？"', nextSceneId: 8 },
      { id: '6b', text: '感受这片星海的力量', nextSceneId: 10 },
    ],
  },
  {
    id: 7,
    title: '苏月的秘密',
    locationName: '云中城·花园',
    characters: ['林星辰', '苏月'],
    narration: '苏月听完你的描述后，神色复杂。她轻轻摘下脖子上的星尘项链，递到你面前。「其实我一直在等你觉醒，」她低声说道，「我的家族世代守护着星辰之主觉醒的秘密。这条项链，是上一任星辰之主留下的。」',
    options: [
      { id: '7a', text: '握住苏月的手，感谢她的信任', nextSceneId: 9 },
      { id: '7b', text: '接过项链仔细端详', nextSceneId: 8 },
    ],
  },
  {
    id: 8,
    title: '命运的真相',
    locationName: '天澜星·观星台',
    characters: ['林星辰', '北辰', '星灵'],
    narration: '真相渐渐浮出水面。上一任星辰之主并非自然陨落，而是在与暗影之主的战斗中，为了保护天澜星而牺牲了自己。他的星辰之力被分散到星域各处，等待着下一位继承者的觉醒。而那个人，就是你。',
    options: [
      { id: '8a', text: '决心继承星辰之力，守护天澜星', nextSceneId: 10 },
      { id: '8b', text: '询问是否有避免战斗的方法', nextSceneId: 9 },
    ],
  },
  {
    id: 9,
    title: '犹豫与抉择',
    locationName: '云中城·城墙',
    characters: ['林星辰', '苏月'],
    narration: '你站在城墙上，眺望着远方的天际线。苏月静静地陪在你身边。\n\n「我不知道自己能不能做好，」你说道，「我怕辜负了所有人的期待。」\n\n苏月轻轻靠在你肩上：「没有人一开始就知道答案。但我知道，你就是那个对的人。」',
    options: [
      { id: '9a', text: '下定决心，开启修行之路', nextSceneId: 10 },
      { id: '9b', text: '先在学府中默默学习，积蓄力量', nextSceneId: 10 },
    ],
  },
  {
    id: 10,
    title: '星辰之主的决心',
    locationName: '星辰学府·广场',
    characters: ['林星辰', '北辰', '苏月', '云城主'],
    narration: '阳光洒落在星辰学府的广场上。你站在所有人面前，掌心的星辰纹印已经不再隐藏。\n\n北辰师父将命运之书的残页放入你手中，云城主郑重地点了点头。苏月眼中闪烁着泪光——那是骄傲与不舍。\n\n从今天起，你不再是普通的少年。你是被星辰选中的人。',
    options: [],
  },
];

function getScene(id: number): SceneNode | null {
  return MOCK_SCENES.find((s) => s.id === id) ?? null;
}

export const useStoryFlowStore = create<StoryFlowState>((set, get) => ({
  isOpen: false,
  currentSceneId: 1,
  perspective: 'first',
  decisionChain: [],
  triggerChapterId: null,

  open: (chapterId) => {
    set({
      isOpen: true,
      currentSceneId: 1,
      decisionChain: [],
      triggerChapterId: chapterId,
    });
  },

  close: () => set({ isOpen: false, triggerChapterId: null }),

  setPerspective: (p) => set({ perspective: p }),

  makeDecision: (optionId, optionText) => {
    const { currentSceneId, decisionChain, perspective } = get();
    const currentScene = getScene(currentSceneId);
    if (!currentScene) return;

    const newDecision: Decision = {
      id: decisionChain.length + 1,
      sceneTitle: currentScene.title,
      chosenOption: optionText,
      timestamp: Date.now(),
    };

    const option = currentScene.options.find((o) => o.id === optionId);
    const nextSceneId = option?.nextSceneId ?? currentSceneId;

    set({
      currentSceneId: nextSceneId,
      decisionChain: [...decisionChain, newDecision],
    });
  },

  getCurrentScene: () => {
    return getScene(get().currentSceneId);
  },
}));

export { MOCK_SCENES };
export type { SceneNode, SceneOption, Decision, Perspective };
