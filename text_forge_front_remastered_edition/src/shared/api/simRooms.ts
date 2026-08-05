// 角色模拟房间 REST 封装，统一对接后端 /api/sim-rooms 接口。
import { authFetch } from '@/shared/lib/authFetch';

// 房间参与者信息（来自后端的 SimParticipant）。
export interface SimRoomParticipant {
  id: number;
  entityType: string;
  entityId: number;
  roleLabel: string;
  personalityOverride?: string | null;
}

// 单条模拟消息（来自后端的 SimMessage）。
export interface SimRoomMessage {
  id: number;
  senderType: string;
  senderLabel: string;
  content: string;
  messageType: string;
  createdAt?: string;
}

// 房间列表项摘要（来自 list_rooms 响应）。
export interface SimRoomSummary {
  id: number;
  bookId: number;
  name: string;
  description?: string | null;
  status: string;
  locationId?: number | null;
  participantCount: number;
  roundCount: number;
  createdAt: string;
}

// 房间完整详情（来自 get_room 响应）。
export interface SimRoomDetail {
  id: number;
  bookId: number;
  name: string;
  description?: string | null;
  status: string;
  setting?: string | null;
  locationId?: number | null;
  roundCount: number;
  participants: SimRoomParticipant[];
  messages: SimRoomMessage[];
  relatedEventIds: number[];
  relatedForeshadowingIds: number[];
  relatedPlotThreadIds: number[];
}

// 创建房间请求体。
export interface CreateSimRoomPayload {
  bookId: number;
  name: string;
  description?: string | null;
  setting?: string | null;
  locationId?: number | null;
  participantIds?: number[];
  participantTypes?: string[];
  relatedEventIds?: number[];
  relatedForeshadowingIds?: number[];
  relatedPlotThreadIds?: number[];
}

// 拉取指定书籍下的模拟房间列表。
export async function listSimRooms(bookId: number): Promise<SimRoomSummary[]> {
  try {
    const res = await authFetch(`/api/sim-rooms/?bookId=${bookId}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.items ?? data.rooms ?? [];
  } catch {
    return [];
  }
}

// 获取单个房间的详情（含参与者与历史消息）。
export async function getSimRoom(roomId: number): Promise<SimRoomDetail | null> {
  try {
    const res = await authFetch(`/api/sim-rooms/${roomId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.room ?? null;
  } catch {
    return null;
  }
}

// 创建新的模拟房间，返回后端生成的房间 id 与名称。
export async function createSimRoom(
  payload: CreateSimRoomPayload,
): Promise<{ id: number; name: string } | null> {
  try {
    const res = await authFetch('/api/sim-rooms/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
