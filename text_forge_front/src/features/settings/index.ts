// features/settings 公开 API。
// 其它切片/页面只应从 '@/features/settings' 消费，禁止深路径直连内部文件。

// ---- UI 组件 ----
export { EmbedModelManager } from './ui/EmbedModelManager';
export { ModelEditDialog } from './ui/ModelEditDialog';
export { ModelsSettings } from './ui/ModelsSettings';

// ---- Stores ----
export { useSettingsStore } from './stores/settingsStore';
export { useModelStore } from './stores/modelStore';
export type { SuggestionFrequency, BgArea } from './stores/settingsStore';

// ---- 模型预设 ----
export { MODEL_TEMPLATES } from './api/templates';
export type { ModelTemplate } from './api/templates';
