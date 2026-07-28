import apiClient from '@/shared/lib/apiClient';
import { authFetch } from '@/shared/lib/authFetch';
import type { Character, Message, ChatMessageRequest } from '@/types';

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

export async function fetchCharacters(bookId?: number): Promise<Character[]> {
  const url = bookId !== undefined ? `/api/characters?book_id=${bookId}` : '/api/characters';
  const { data } = await apiClient.get<CharactersResponse>(url);
  return data.characters || [];
}

export interface CreateCharacterRequest {
  name: string;
  description: string;
  bookId?: number;
  avatarUrl?: string;
}

export async function createCharacter(body: CreateCharacterRequest): Promise<Character> {
  const { data } = await apiClient.post<CharacterResponse>('/api/characters', body);
  return data.character;
}

export interface UpdateCharacterRequest {
  name?: string;
  description?: string;
  avatarUrl?: string;
  aliases?: string[] | null;
  roleType?: string;
  status?: string;
  relationshipChain?: { target: string; relation: string }[];
}

export async function updateCharacter(id: number, body: UpdateCharacterRequest): Promise<Character> {
  const { data } = await apiClient.put<CharacterResponse>(`/api/characters/${id}`, body);
  return data.character;
}

export async function uploadAvatar(id: number, file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await apiClient.post<AvatarResponse>(`/api/characters/${id}/avatar`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.avatar_url || data.url || data.avatar || '';
}

export async function deleteCharacter(id: number): Promise<void> {
  await apiClient.delete(`/api/characters/${id}`);
}

export async function fetchCharacterDetail(id: number): Promise<Character> {
  const { data } = await apiClient.get<CharacterResponse>(`/api/characters/${id}`);
  return data.character;
}

export async function fetchCharacterMessages(id: number, thread_id?: string): Promise<Message[]> {
  const params = thread_id ? `?thread_id=${encodeURIComponent(thread_id)}` : '';
  const { data } = await apiClient.get<MessagesResponse>(`/api/characters/${id}/messages${params}`);
  return data.messages || [];
}

export async function sendChatMessage(id: number, req: ChatMessageRequest): Promise<Response> {
  const body: Record<string, unknown> = {
    message: req.message,
  };
  if (req.book_id) body.book_id = req.book_id;
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
