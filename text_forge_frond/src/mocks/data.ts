// src/mocks/data.ts
// 开发期 mock 的假数据。后端未就绪时由 handlers 返回，仅用于本地预览。

function now() {
  return new Date().toISOString();
}

export const MOCK_USER = {
  id: 'dev-user-1',
  username: '墨客',
  email: 'dev@textforge.local',
  avatar: '',
};

// 内联 SVG 占位头像（data URI），避免依赖外部图床（placehold.co 常 400），
// 同时不触发 next/image 的 remotePatterns 域名限制，离线也能正常显示。
function inlineAvatar(bg: string, fg: string, label: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="96" height="96" rx="48" fill="${bg}"/><text x="50%" y="54%" font-size="40" fill="${fg}" font-family="sans-serif" text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

const AVATAR_LINMO = inlineAvatar('#6366f1', '#ffffff', '林');
const AVATAR_SUNI = inlineAvatar('#ec4899', '#ffffff', '苏');

export const MOCK_PROJECTS = [
  {
    id: 'dev-p-1',
    title: '星海拾遗',
    status: 'generating' as const,
    genre: '科幻',
    description: '一艘游离于星海之间的拾荒船，载着最后的文明碎片。',
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: 'dev-p-2',
    title: '青衫故梦',
    status: 'completed' as const,
    genre: '古风',
    description: '江南烟雨里，一段被岁月掩埋的旧事。',
    createdAt: now(),
    updatedAt: now(),
  },
  {
    id: 'dev-p-3',
    title: '雾港谜案',
    status: 'draft' as const,
    genre: '悬疑',
    description: '浓雾笼罩的港口，每一盏灯后都藏着一个秘密。',
    createdAt: now(),
    updatedAt: now(),
  },
];

export const MOCK_CHARACTERS = [
  {
    id: 'dev-c-1',
    name: '林墨',
    description: '沉默的拾荒者，习惯用诗记录星海。',
    projectId: 'dev-p-1',
    avatar: AVATAR_LINMO,
    images: [AVATAR_LINMO],
    createdAt: now(),
  },
  {
    id: 'dev-c-2',
    name: '苏霓',
    description: '雾港的灯塔守夜人，知晓所有航船的去向。',
    projectId: 'dev-p-3',
    avatar: AVATAR_SUNI,
    images: [AVATAR_SUNI],
    createdAt: now(),
  },
];

export const MOCK_PROJECT_STEPS = [
  { id: 's1', agent: 'planner', nodeId: 'planner', content: '已生成故事大纲。', status: 'completed' as const },
  { id: 's2', agent: 'writer', nodeId: 'writer', content: '第一章：星海初现……', status: 'waiting' as const },
];
