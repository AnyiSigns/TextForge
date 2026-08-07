// 手稿编辑器联想候选池与过滤逻辑（纯函数，便于复用与测试）。
// 由旧前端 manuscriptSuggestions 迁移，类型对齐 remastered 的 Chapter / CreativeSetting。
import type { Character, CreativeSetting } from '@/shared/api/types';

export type SuggestionKind = 'character' | 'setting' | 'hint';

export interface Suggestion {
  kind: SuggestionKind;
  label: string;
  detail?: string;
}

export function buildSettingKeywords(brief: CreativeSetting | null): Suggestion[] {
  const list: Suggestion[] = [];
  if (brief?.worldview) list.push({ kind: 'setting', label: '世界观', detail: brief.worldview.slice(0, 24) });
  if (brief?.tone) list.push({ kind: 'setting', label: '基调', detail: brief.tone.slice(0, 24) });
  const dims = brief?.customDimensions ?? {};
  Object.entries(dims).forEach(([key, value]) => {
    const content = typeof value === 'string' ? value : JSON.stringify(value);
    list.push({ kind: 'setting', label: key, detail: content.slice(0, 24) });
  });
  return list;
}

export function buildCharSuggestions(characters: Character[]): Suggestion[] {
  return characters.map((c) => ({
    kind: 'character' as const,
    label: c.name,
    detail: c.description?.slice(0, 24) ?? '',
  }));
}

// # 设定联想：若项目尚未填写任何设定，给出引导提示而非静默无结果。
export function computeSuggestionsFor(
  kind: SuggestionKind,
  query: string,
  settingKeywords: Suggestion[],
  charSuggestions: Suggestion[],
): Suggestion[] {
  if (kind === 'setting' && settingKeywords.length === 0) {
    return [{ kind: 'hint', label: '尚未填写创作设定', detail: '去「创作设定」填写世界观/基调，# 即可联想' }];
  }
  const pool = kind === 'character' ? charSuggestions : settingKeywords;
  if (!query) return pool.slice(0, 6);
  return pool.filter((s) => s.label.includes(query) || s.detail?.includes(query)).slice(0, 6);
}
