// src/types/character.ts
// 角色相关类型。

// 角色在故事中的基础定位（预设 + 自定义），用于生成时区分戏份权重。
export type CharacterRole =
  | 'protagonist'      // 主角
  | 'heroine'          // 女主
  | 'deuteragonist'    // 男二
  | 'antagonist'      // 反派
  | 'supporting'      // 配角
  | 'custom'          // 自定义
  | (string & {});     // 允许任意自定义字符串

/** 角色关系：指向本项目的另一个角色，并可自定义关系描述（如「青梅竹马、暗恋」）。 */
export interface CharacterRelation {
  target: string;
  relation: string;
}

export interface Character {
  id: number;
  bookId: number;
  name: string;
  avatarUrl?: string;
  aliases?: string[] | null;
  description: string;
  roleType?: string;
  status?: string;
  relationshipChain?: CharacterRelation[];
  createdAt: string;
  updatedAt: string;
}
