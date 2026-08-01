import { FileText, ListTree, FileCog, Users, ImageIcon, Clapperboard, BookOpen, Settings2, BarChart, Shield, Globe } from 'lucide-react';
import type { ProcessTab } from './ui/ProcessNav';

export const PROJECT_TABS: ProcessTab[] = [
  { value: 'workbench', label: '工作台', icon: FileText, group: '创作' },
  { value: 'outline', label: '大纲', icon: ListTree, group: '创作' },
  { value: 'inspiration', label: '章节摘要', icon: FileText, group: '创作' },
  { value: 'brief', label: '创作设定', icon: FileCog, group: '创作' },
  { value: 'characters', label: '角色', icon: Users, group: '设定' },
  { value: 'world-building', label: '世界构建', icon: Globe, group: '设定' },
  { value: 'context', label: '工作流上下文', icon: Settings2, group: '设定' },
  { value: 'animation', label: '章节动画', icon: Clapperboard, group: '工具' },
  { value: 'material', label: '角色素材', icon: ImageIcon, group: '工具' },
  { value: 'stats', label: '统计', icon: BarChart },
  { value: 'agent-rules', label: 'Agent 规则', icon: Shield },
];