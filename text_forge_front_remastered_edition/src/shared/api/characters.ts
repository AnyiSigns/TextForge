import { apiClient } from './client';
import type { Character } from './types';

export async function fetchCharacters(bookId: number): Promise<Character[]> {
  const { data } = await apiClient.get<{ characters: Character[] }>(`/books/${bookId}/characters`);
  return data.characters ?? [];
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
