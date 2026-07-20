import apiClient from '@/shared/lib/apiClient';
import { authFetch } from '@/shared/lib/authFetch';
import { Character, Message, ChatMessageRequest } from '@/types';

interface CharactersResponse {
  characters: Character[];
}

interface CharacterResponse {
  character: Character;
}

interface AvatarResponse {
  avatar_url?: string;
  url?: string;
  avatar?: string;
}

interface MessagesResponse {
  messages: Message[];
}

export async function fetchCharacters(): Promise<Character[]> {
  const { data } = await apiClient.get<CharactersResponse>('/api/characters');
  return data.characters || [];
}

export interface CreateCharacterRequest {
  name: string;
  description: string;
  projectId?: string | null;
  avatar?: string;
}

export async function createCharacter(body: CreateCharacterRequest): Promise<Character> {
  const { data } = await apiClient.post<CharacterResponse>('/api/characters', body);
  return data.character;
}

export interface UpdateCharacterRequest {
  name?: string;
  description?: string;
  avatar?: string;
  images?: string[];
  role?: string;          // 故事定位：主角/女主/配角/反派…（自定义字符串）
  customRole?: string;     // 选中「自定义」时的定位文案
  status?: string;        // 当前状态：存活/死亡/自定义
  currentProfile?: string; // 当前时间点详情：心理/关系/处境/变化
  relationships?: { id: string; targetId: string; relation: string }[]; // 结构化角色关系
  referenceImages?: string[] | null; // 角色一致性参考图（多张，取消时传 null）
  imageSeed?: number | null;
}

export async function updateCharacter(id: string, body: UpdateCharacterRequest): Promise<Character> {
  const { data } = await apiClient.put<CharacterResponse>(`/api/characters/${id}`, body);
  return data.character || data;
}

export async function uploadAvatar(id: string, file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post<AvatarResponse>(`/api/characters/${id}/avatar`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.avatar_url || data.url || data.avatar || '';
}

export async function deleteCharacter(id: string): Promise<void> {
  await apiClient.delete(`/api/characters/${id}`);
}

export async function fetchCharacterDetail(id: string): Promise<Character> {
  const { data } = await apiClient.get<CharacterResponse>(`/api/characters/${id}`);
  return data.character;
}

export async function fetchCharacterMessages(id: string, thread_id?: string): Promise<Message[]> {
  const params = thread_id ? `?thread_id=${encodeURIComponent(thread_id)}` : '';
  const { data } = await apiClient.get<MessagesResponse>(`/api/characters/${id}/messages${params}`);
  return data.messages || [];
}

export async function sendChatMessage(id: string, req: ChatMessageRequest): Promise<Response> {
  const body: Record<string, unknown> = {
    message: req.message,
  };
  if (req.project_id) body.project_id = req.project_id;
  if (req.brief) body.brief = req.brief;
  if (req.character_name) body.character_name = req.character_name;
  if (req.character_description) body.character_description = req.character_description;
  if (req.thread_id) body.thread_id = req.thread_id;
  if (req.messages && req.messages.length) body.messages = req.messages;

  const res = await authFetch(`/api/characters/${id}/chat`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = new Error(`角色对话请求失败（${res.status}）`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return res;
}