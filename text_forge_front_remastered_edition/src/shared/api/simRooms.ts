// 角色模拟房间 REST 封装，统一对接后端 /api/sim-rooms 接口。
// 使用 apiClient（axios）：带 Authorization 且 401 时自动刷新 token 并重试，
// 避免裸 fetch（authFetch）在 token 过期时直接 401 导致创建失败。
import { apiClient } from './client';

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

// 一条结构化的角色支线（来自 sim_branches 表）。
export interface SimBranch {
  id: number;
  title: string;
  content: string;
  branchType: string;
  relatedCharacterIds?: number[];
  relatedLocationId?: number | null;
  relatedEventId?: number | null;
  relatedForeshadowingId?: number | null;
  createdAt?: string;
}

// 房间完整详情（来自 get_room 响应）。
export interface SimRoomDetail {
  id: number;
  bookId: number;
  name: string;
  description?: string | null;
  status: string;
  locationId?: number | null;
  roundCount: number;
  participants: SimRoomParticipant[];
  messages: SimRoomMessage[];
  branches?: SimBranch[];
  relatedEventIds: number[];
  relatedForeshadowingIds: number[];
  relatedPlotThreadIds: number[];
}

// 创建房间请求体。
export interface CreateSimRoomPayload {
  bookId: number;
  name: string;
  description?: string | null;
  locationId?: number | null;
  userCharacterId?: number | null;
  participantIds?: number[];
  participantTypes?: string[];
  relatedEventIds?: number[];
  relatedForeshadowingIds?: number[];
  relatedPlotThreadIds?: number[];
}

// 拉取指定书籍下的模拟房间列表。
export async function listSimRooms(bookId: number): Promise<SimRoomSummary[]> {
  try {
    const { data } = await apiClient.get<{ items?: SimRoomSummary[]; rooms?: SimRoomSummary[] }>(
      `/sim-rooms/?bookId=${bookId}`,
    );
    return data.items ?? data.rooms ?? [];
  } catch {
    return [];
  }
}

// 获取单个房间的详情（含参与者与历史消息）。
export async function getSimRoom(roomId: number): Promise<SimRoomDetail | null> {
  try {
    const { data } = await apiClient.get<{ room?: SimRoomDetail }>(`/sim-rooms/${roomId}`);
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
    const { data } = await apiClient.post<{ id: number; name: string }>('/sim-rooms/', payload);
    return data;
  } catch {
    return null;
  }
}

// 删除模拟房间（后端级联清理参与者/消息/支线/角色记忆）。
export async function deleteSimRoom(roomId: number): Promise<boolean> {
  try {
    await apiClient.delete(`/sim-rooms/${roomId}`);
    return true;
  } catch {
    return false;
  }
}
