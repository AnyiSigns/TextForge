// src/lib/api/characters.ts
// 角色域 API（契约层对接 openapi/seed-api.yaml -> src/types/generated.ts）。
// 类型级用 generated.ts 约束，运行时走 shared/lib/api.ts + lib/validation/responses.ts。
import { apiDelete, apiGet, apiPost, apiPut } from '@/shared/lib/api';
import {
  avatarResponseSchema,
  characterResponseSchema,
  charactersResponseSchema,
  messagesResponseSchema,
} from '@/lib/validation/responses';
import type { components, paths } from '@/types/generated';

type Character = components['schemas']['Character'];
type CharactersResponse = components['schemas']['CharactersResponse'];
type CharacterResponse = components['schemas']['CharacterResponse'];
type CreateCharacterRequest = components['schemas']['CreateCharacterRequest'];
type UpdateCharacterRequest = components['schemas']['UpdateCharacterRequest'];
type AvatarResponse = components['schemas']['AvatarResponse'];
type Message = components['schemas']['Message'];

type ListCharactersQuery = paths['/characters']['get']['parameters']['query'];

export async function listAllCharacters(query?: ListCharactersQuery): Promise<CharactersResponse> {
  return apiGet<CharactersResponse>(
    '/api/characters',
    charactersResponseSchema as never,
    'listAllCharacters',
    query ? { params: query } : undefined,
  );
}

export async function getCharacter(id: string): Promise<CharacterResponse> {
  return apiGet<CharacterResponse>(
    `/api/characters/${id}`,
    characterResponseSchema as never,
    'getCharacter',
  );
}

export async function createCharacter(body: CreateCharacterRequest): Promise<CharacterResponse> {
  return apiPost<CharacterResponse>(
    '/api/characters',
    characterResponseSchema as never,
    'createCharacter',
    body,
  );
}

export async function updateCharacter(
  id: string,
  body: UpdateCharacterRequest,
): Promise<CharacterResponse> {
  return apiPut<CharacterResponse>(
    `/api/characters/${id}`,
    characterResponseSchema as never,
    'updateCharacter',
    body,
  );
}

export async function deleteCharacter(id: string): Promise<void> {
  await apiDelete<unknown>(`/api/characters/${id}`, undefined as never, 'deleteCharacter');
}

export async function getCharacterAvatar(id: string): Promise<AvatarResponse> {
  return apiGet<AvatarResponse>(
    `/api/characters/${id}/avatar`,
    avatarResponseSchema as never,
    'getCharacterAvatar',
  );
}

export async function listCharacterMessages(id: string): Promise<Message[]> {
  const res = await apiGet<{ messages: Message[] }>(
    `/api/characters/${id}/messages`,
    messagesResponseSchema as never,
    'listCharacterMessages',
  );
  return res.messages;
}

export async function postCharacterChat(
  id: string,
  body: components['schemas']['ChatMessageRequest'],
): Promise<Message> {
  return apiPost<Message>(
    `/api/characters/${id}/chat`,
    undefined as never,
    'postCharacterChat',
    body,
  );
}

export type { Character };
