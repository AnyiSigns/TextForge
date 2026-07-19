// src/types/character.ts
// 角色相关类型。
import type { Origin } from './common';

// 角色在故事中的基础定位（预设 + 自定义），用于生成时区分戏份权重。
// 角色间的"关系"用结构化 relationships 表达（见下），可自由增删自定义。
export type CharacterRole =
  | 'protagonist'      // 主角
  | 'heroine'          // 女主
  | 'deuteragonist'    // 男二
  | 'antagonist'      // 反派
  | 'supporting'      // 配角
  | 'custom'          // 自定义
  | (string & {});     // 允许任意自定义字符串

/** 角色关系：指向本项目的另一个角色，并可自定义关系描述（如「青梅竹马、暗恋」）。 */
export interface CharacterRelationship {
  id: string;
  /** 对端角色 id（限制在本项目内，便于生成时解析） */
  targetId: string;
  /** 关系描述：可自由填写，如「宿敌」「师徒」「暗恋」 */
  relation: string;
}

export interface Character {
  id: string;
  name: string;
  avatar?: string;
  description: string;        // 静态人设（初始卡）
  role?: CharacterRole;       // 故事定位：主角/女主/配角/反派…
  status?: string;            // 当前状态：存活/死亡/自定义（string 支持任意）
  currentProfile?: string;    // 当前时间点详情：心理/关系/处境/变化（随剧情演化）
  /** 故事定位的自定义文案：当选中「自定义」时填写，显示用 */
  customRole?: string;
  /** 结构化角色关系：与谁、是什么关系（可自定义）。替代把关系塞进 currentProfile 文本。 */
  relationships?: CharacterRelationship[];
  novelId?: string;
  projectId?: string | null;
  images?: string[];
  /** 角色一致性：锁定用作参考图的 URL（出图时作为 reference_image 透传） */
  referenceImage?: string | null;
  /** 角色一致性：锁定的随机种子（出图时作为 seed 透传） */
  imageSeed?: number | null;
  origin?: Origin;          // 角色来源（种子/用户），增量合并用
  createdAt: string;
}
