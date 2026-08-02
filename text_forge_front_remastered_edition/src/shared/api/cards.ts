import type { CardSession } from './types';

export async function openCardSession(body: { book_id: number; card_type?: string; title?: string; model_config?: Record<string, unknown> }): Promise<CardSession> {
  const res = await fetch('/api/cards/open', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error('打开卡片会话失败');
  return res.json();
}

export async function closeCardSession(cardId: string): Promise<void> {
  await fetch(`/api/cards/${cardId}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
  }).catch(() => {});
}

export async function confirmCard(cardId: string): Promise<{ success: boolean; card_result: unknown }> {
  const res = await fetch('/api/cards/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ card_id: cardId }),
  });
  if (!res.ok) throw new Error('确认卡片失败');
  return res.json();
}

export function createCardWebSocket(cardId: string, token: string): WebSocket {
  const wsUrl = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}/api/cards/${cardId}`;
  const ws = new WebSocket(wsUrl, token);
  return ws;
}
