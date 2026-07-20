// src/lib/hooks/workbenchSeed.ts
// 项目工作台「开局/手稿」动作：一句话开局、手写第一章、发送到手稿。纯逻辑，依赖注入。
import { toast } from 'sonner';
import { generateSeed } from '@/lib/seed/generate';
import { useManuscriptStore } from '@/features/manuscript';
import type { Step } from '@/types';
import type { Workflow } from '@/features/workflow';

export interface SeedActionDeps {
  projectId: string;
  activeWorkflow: Workflow | null;
  seedPrompt: string;
  isSeeding: boolean;
  setSeedOpen: (v: boolean) => void;
  setSeeded: (v: boolean) => void;
  setIsSeeding: (v: boolean) => void;
  setSteps: React.Dispatch<React.SetStateAction<Step[]>>;
  setEditingMap: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export function makeSeedActions(d: SeedActionDeps) {
  const { projectId, activeWorkflow, seedPrompt, isSeeding, setSeedOpen, setSeeded, setIsSeeding, setSteps, setEditingMap } = d;

  const handleSendToManuscript = async (step: Step) => {
    const titleMatch = step.content.match(/^#\s*(.+)$/m);
    const title = titleMatch?.[1]?.trim() || `${activeWorkflow?.name ?? '章节'}片段`;
    await useManuscriptStore.getState().importFromStep(projectId, title, step.content, step.id, 'ai');
    toast.success('已发送到手稿（可继续人写）');
  };

  const handleWriteFirstChapter = () => {
    const step: Step = {
      id: `step-${Date.now()}`,
      agent: 'writer',
      nodeId: 'writer',
      content: '# 第一章\n\n',
      status: 'waiting',
    };
    setSteps((prev) => [...prev, step]);
    setEditingMap((prev) => ({ ...prev, [step.id]: step.content }));
    toast.info('已开好第一章，直接在下方修改即可');
  };

  const handleSeed = async () => {
    if (!seedPrompt.trim() || isSeeding) return;
    setIsSeeding(true);
    try {
      await generateSeed(projectId, seedPrompt.trim());
      setSeeded(true);
      setSeedOpen(false);
      toast.success('已生成世界观/角色/大纲，去各标签微调后就能生成正文');
    } catch (e) {
      toast.error('开局生成失败', { description: e instanceof Error ? e.message : '未知错误' });
    } finally {
      setIsSeeding(false);
    }
  };

  return { handleSendToManuscript, handleWriteFirstChapter, handleSeed };
}
