'use client';

import { CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Image as ImageIcon, Clapperboard, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BadgeState } from './BadgeState';
import type { StudioMode } from './ProjectStudio';

interface ProjectStudioHeaderProps {
  mode: StudioMode;
  isExpanded: boolean;
  onToggle: () => void;
  taskCount: number;
  hasRunningTasks: boolean;
}

export function ProjectStudioHeader({ mode, isExpanded, onToggle, taskCount, hasRunningTasks }: ProjectStudioHeaderProps) {
  return (
    <CardHeader className="cursor-pointer select-none" onClick={onToggle}>
      <CardTitle className="flex items-center justify-between">
        <span className="flex items-center gap-2">
          {mode === 'character' ? <ImageIcon className="w-4 h-4 text-primary" /> : <Clapperboard className="w-4 h-4 text-primary" />}
          {mode === 'character' ? '角色素材（可选）' : '章节动画（可选）'}
          {hasRunningTasks && (
            <BadgeState taskCount={taskCount} />
          )}
        </span>
        <ChevronDown className={cn('w-4 h-4 text-muted-foreground transition-transform', isExpanded && 'rotate-180')} />
      </CardTitle>
      <p className="text-xs text-muted-foreground mt-1">
        {mode === 'character'
          ? '为角色生成立绘形象；已锁定的参考图会保持多图一致。也可到顶部「AI 绘画」页做更精细的生成。'
          : '把章节片段做成 AI 动画视频；生成时会带入该章出场角色的立绘与介绍，保证角色样貌连贯。'}
      </p>
    </CardHeader>
  );
}