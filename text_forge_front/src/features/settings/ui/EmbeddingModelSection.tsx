'use client';

import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2, Check, AlertCircle } from 'lucide-react';
import type { RoleModelConfig } from '@/types';

interface EmbeddingModelSectionProps {
  embeddingPublicConfig: RoleModelConfig | null;
  testStatus: Record<string, 'idle' | 'testing' | 'success' | 'error'>;
  onEdit: () => void;
  onDelete: () => void;
  onTest: (m: RoleModelConfig) => void;
  onAdd: () => void;
}

export function EmbeddingModelSection({ embeddingPublicConfig, testStatus, onEdit, onDelete, onTest, onAdd }: EmbeddingModelSectionProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">公共文档库检索模型</p>
      </div>
      {embeddingPublicConfig && embeddingPublicConfig.modelId ? (
        <div className="rounded-xl border border-border/40 bg-background/40 p-3 space-y-2">
          <p className="text-sm font-medium truncate">{embeddingPublicConfig.name}</p>
          <p className="text-xs text-muted-foreground truncate">{embeddingPublicConfig.modelId}</p>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onTest(embeddingPublicConfig)}>
              {testStatus[embeddingPublicConfig.id] === 'success' ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : testStatus[embeddingPublicConfig.id] === 'error' ? <AlertCircle className="w-3.5 h-3.5 text-destructive" /> : <AlertCircle className="w-3.5 h-3.5" />}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={onEdit}>
              <Pencil className="w-3.5 h-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 px-2 text-muted-foreground hover:text-destructive" onClick={onDelete}>
              <Trash2 className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="w-3.5 h-3.5 mr-1" /> 添加云端检索模型
        </Button>
      )}
    </div>
  );
}