// features/characters 公开 API。
// 其它切片/页面只应从 '@/features/characters' 消费，禁止深路径直连内部文件。

// ---- UI 组件 ----
export { CharacterCard } from './ui/CharacterCard';
export { CharacterStudioSheet } from './ui/CharacterStudioSheet';
export { ChatMessage } from './ui/ChatMessage';

// ---- API ----
export {
  fetchCharacters,
  createCharacter,
  updateCharacter,
  uploadAvatar,
  deleteCharacter,
  fetchCharacterDetail,
  fetchCharacterMessages,
  sendChatMessage,
} from './api/characters';
export type {
  CreateCharacterRequest,
  UpdateCharacterRequest,
} from './api/characters';
export type { ChatMessageRequest } from '@/types';

// ---- Stores ----
export { useCharacterStore } from './stores/characterStore';
