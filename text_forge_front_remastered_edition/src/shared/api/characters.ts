import { apiClient } from './client';
import type { Character } from './types';

export async function fetchCharacters(bookId: number): Promise<Character[]> {
  const { data } = await apiClient.get<{ characters: Character[] }>(`/books/${bookId}/characters`);
  return data.characters ?? [];
}

export async function fetchAllCharacters(): Promise<Character[]> {
  const { data } = await apiClient.get<{ characters: Character[] }>('/characters/');
  return data.characters ?? [];
}

export async function fetchCharacter(id: number): Promise<Character> {
  const { data } = await apiClient.get<Character>(`/characters/${id}`);
  return data;
}

export async function createCharacter(body: Partial<Character>): Promise<Character> {
  const { data } = await apiClient.post<Character>('/characters/', body);
  return data;
}

export async function updateCharacter(id: number, body: Partial<Character>): Promise<Character> {
  const { data } = await apiClient.put<Character>(`/characters/${id}`, body);
  return data;
}

export async function deleteCharacter(id: number): Promise<void> {
  await apiClient.delete(`/characters/${id}`);
}

export async function fetchCharacterAvatarUrl(id: number): Promise<{ avatarUrl: string }> {
  const { data } = await apiClient.get<{ avatarUrl: string }>(`/characters/${id}/avatar`);
  return data;
}

export async function uploadCharacterAvatar(id: number, file: File): Promise<{ avatarUrl: string }> {
  const form = new FormData();
  form.append('file', file);
  const { data } = await apiClient.post<{ avatarUrl: string }>(`/characters/${id}/avatar`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}

export async function deleteCharacterAvatar(id: number): Promise<void> {
  await apiClient.delete(`/characters/${id}/avatar`);
}
