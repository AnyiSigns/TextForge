import { FileText, ListTree, FileCog, Users, ImageIcon, Clapperboard, BookOpen, Settings2, BarChart, Shield, Globe } from 'lucide-react';
import type { ProcessTab } from './ui/ProcessNav';

export const PROJECT_TABS: ProcessTab[] = [
  { value: 'workbench', label: '工作台', icon: FileText },
  { value: 'outline', label: '大纲', icon: ListTree },
  { value: 'inspiration', label: '章节摘要', icon: FileText },
  { value: 'brief', label: '创作设定', icon: FileCog },
  { value: 'characters', label: '角色', icon: Users },
  { value: 'context', label: '工作流上下文', icon: Settings2 },
  { value: 'material', label: '角色素材', icon: ImageIcon },
  { value: 'animation', label: '章节动画', icon: Clapperboard },
  { value: 'stats', label: '统计', icon: BarChart },
  { value: 'world-building', label: '世界构建', icon: Globe },
  { value: 'agent-rules', label: 'Agent 规则', icon: Shield },
];