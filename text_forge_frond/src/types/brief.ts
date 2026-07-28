// src/types/brief.ts
// 创作设定相关类型。
// 已迁移到 creativeSetting.ts，本文件仅作兼容别名保留。
import type { BookCreativeSetting, CustomDimension } from './creativeSetting';

/** @deprecated 使用 BookCreativeSetting 替代 */
export type ProjectBrief = BookCreativeSetting;

/** @deprecated 使用 CustomDimension 替代 */
export type BriefSection = CustomDimension;
