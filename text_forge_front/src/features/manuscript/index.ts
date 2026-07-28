// features/manuscript 公开 API。
// 其它切片/页面只应从 '@/features/manuscript' 消费，禁止深路径直连内部文件。

// ---- UI 组件 ----
export { ManuscriptEditor } from './ui/ManuscriptEditor';

// ---- Hooks ----
export { useManuscriptEditor } from './hooks/useManuscriptEditor';
export { makeManuscriptIO } from './hooks/manuscriptIO';
export {
  buildSettingKeywords,
  buildCharSuggestions,
  computeSuggestionsFor,
} from './hooks/manuscriptSuggestions';
export type { Suggestion, SuggestionKind, SuggestState } from './hooks/useManuscriptEditor';
export type { ManuscriptIO } from './hooks/manuscriptIO';

// ---- Stores ----
export { useManuscriptStore } from './stores/manuscriptStore';
