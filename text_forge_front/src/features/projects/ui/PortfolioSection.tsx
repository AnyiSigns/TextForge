'use client';

import { PortfolioGrid } from './PortfolioGrid';
import type { MediaTask } from '@/features/projects/api/media';
import type { StudioMode } from './ProjectStudio';

interface PortfolioSectionProps {
  visiblePortfolio: MediaTask[];
  mode: StudioMode;
  chapterMap: Map<string, { index: number; content: string }>;
  onSetAvatar: (charId: number, url: string) => void;
}

export function PortfolioSection({ visiblePortfolio, mode, chapterMap, onSetAvatar }: PortfolioSectionProps) {
  return (
    <div className="space-y-3 mt-5">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">作品集</p>
      <PortfolioGrid
        items={visiblePortfolio}
        mode={mode}
        chapterMap={chapterMap}
        onSetAvatar={onSetAvatar}
      />
    </div>
  );
}