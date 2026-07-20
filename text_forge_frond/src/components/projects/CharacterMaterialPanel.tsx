// src/components/projects/CharacterMaterialPanel.tsx
'use client';

import { Button } from '@/components/ui/button';
import { Image as ImageIcon } from 'lucide-react';
import type { Character } from '@/types';
import type { ImageRequest } from '@/lib/api/generation';
import type { GenerationContext } from '@/types';

interface CharacterMaterialPanelProps {
  characters: Character[];
  projectId: string;
  imageModelsCount: number;
  buildContext: (source?: GenerationContext['source'], sourceRef?: string) => GenerationContext;
  onImage: (p: ImageRequest) => void;
}

export function CharacterMaterialPanel(props: CharacterMaterialPanelProps) {
  const { characters, projectId, imageModelsCount, buildContext, onImage } = props;

  if (characters.length === 0) {
    return <p className="text-sm text-muted-foreground">该项目暂无关联角色，去「角色」标签创建后再来生成立绘。</p>;
  }

  return (
    <div className="space-y-2">
      {characters.map((c: Character) => (
        <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border/40 bg-background/40">
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{c.name}</p>
            <p className="text-xs text-muted-foreground truncate">{c.description || '无设定'}</p>
            {c.referenceImage && (
              <p className="text-[11px] text-primary mt-0.5 flex items-center gap-1">
                <ImageIcon className="w-3 h-3" /> 已锁定参考图，生图将保持一致
              </p>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={!imageModelsCount}
            onClick={() => onImage({
              prompt: `根据角色设定生成形象：${c.name}。${c.description || ''}`,
              project_id: projectId,
              context: buildContext('character', c.id),
              characterId: c.id,
              ...(c.referenceImage ? { reference_image: c.referenceImage } : {}),
              ...(c.imageSeed != null ? { seed: c.imageSeed } : {}),
            })}
          >
            <ImageIcon className="w-4 h-4 mr-1.5" /> 生图
          </Button>
        </div>
      ))}
    </div>
  );
}
