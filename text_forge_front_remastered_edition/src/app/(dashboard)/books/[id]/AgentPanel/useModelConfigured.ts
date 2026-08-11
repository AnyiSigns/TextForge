'use client';

/**
 * Agent 面板：主模型配置检测（从 AgentPanel.tsx 抽离）。
 * 未配置时展示引导条。
 */
import { useEffect, useState } from 'react';

export function useModelConfigured() {
  const [modelConfigured, setModelConfigured] = useState<boolean | null>(null);

  useEffect(() => {
    import('@/shared/api/models').then(({ fetchModelConfig }) =>
      fetchModelConfig().then((cfg) => {
        const main = cfg.textRoleModels?.main;
        setModelConfigured(!!main?.api_key && !!main?.base_url && !!main?.model_id);
      }).catch(() => setModelConfigured(false)),
    );
  }, []);

  return modelConfigured;
}
