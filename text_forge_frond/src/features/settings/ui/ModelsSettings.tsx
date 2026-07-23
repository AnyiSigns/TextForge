// src/components/settings/ModelsSettings.tsx
'use client';

import { useSettingsStore } from '../stores/settingsStore';
import { EmbedModelManager } from './EmbedModelManager';

export function ModelsSettings() {
  const setEmbedTierId = useSettingsStore((s) => s.setEmbedTierId);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        文本生成模型、视觉模型及公共向量模型由后端统一管理配置，前端无需单独设置。
      </p>
      <EmbedModelManager onDownloaded={setEmbedTierId} />
    </div>
  );
}
