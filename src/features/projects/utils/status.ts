import type { LucideIcon } from 'lucide-react';
import type { Project } from '@/types';
import { FileText, Loader2, CheckCircle2, PauseCircle } from 'lucide-react';

export const STATUS_MAP: Record<
  Project['status'],
  { label: string; icon: LucideIcon; variant: 'outline' | 'secondary' | 'default' }
> = {
  draft: { label: '草稿', icon: FileText, variant: 'outline' },
  generating: { label: '生成中', icon: Loader2, variant: 'secondary' },
  completed: { label: '已完成', icon: CheckCircle2, variant: 'default' },
  paused: { label: '已暂停', icon: PauseCircle, variant: 'outline' },
};
