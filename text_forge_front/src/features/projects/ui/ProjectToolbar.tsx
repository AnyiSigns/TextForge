'use client';

import { Wand2, CheckCircle2, PenLine, Info } from 'lucide-react';
import { useWorkbench } from '@/features/projects';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BUILTIN_WORKFLOW_ID } from '@/types';

interface ProjectToolbarProps {
  projectId: string;
  onNavigateToManuscript: () => void;
  onNavigateToCreativeSetting: () => void;
}

export function ProjectToolbar({ projectId, onNavigateToManuscript, onNavigateToCreativeSetting }: ProjectToolbarProps) {
  const wb = useWorkbench(Number(projectId));
  const {
    showPreviewNote, isPreviewMode, setShowPreviewNote,
    workflows, activeWorkflowId, handleBindWorkflow, activeWorkflow,
    editingMap, savedAt, projectChars, creativeSetting, outlineReady, steps,
  } = wb;

  return (
    <>
      {showPreviewNote && isPreviewMode && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-300">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="flex-1">
            当前为<strong>预览模式</strong>：下方「生成」产出的是本地示例内容（占位），并非 AI 真正写作。配置云端服务地址 / 模型密钥后，这里才会由 AI 按你的设定生成正文。你也可以直接点「写第一章」自己动手写。
          </p>
          <button onClick={() => setShowPreviewNote(false)} className="shrink-0 text-amber-600/70 hover:text-amber-700 dark:hover:text-amber-200 underline-offset-2 hover:underline">知道了</button>
        </div>
      )}

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Wand2 className="w-3.5 h-3.5" /> 创作流水线
        </span>
        <Select value={activeWorkflowId} onValueChange={handleBindWorkflow}>
          <SelectTrigger className="w-[220px]">
          <SelectValue>{(v: string) => {
            if (!v) return '请选择流水线';
            const wf = workflows.find((w) => w.id === v);
            if (wf) return wf.name;
            if (v === BUILTIN_WORKFLOW_ID) return '内置创作流水线';
            return v;
          }}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {workflows.map((w) => (
              <SelectItem key={w.id} value={w.id}>
                {w.builtin ? `${w.name}（内置）` : w.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="ghost" size="sm" asChild>
          <a href="/workflow" className="text-xs">去编排 / 新建工作流</a>
        </Button>
        <span className="text-xs text-muted-foreground/80 flex items-center gap-1 ml-auto">
          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
          {Object.keys(editingMap).length > 0
            ? '正在编辑，停笔即自动保存'
            : savedAt
              ? '已自动保存'
              : '内容会实时保存'}
        </span>
        <div className="flex items-center gap-2 ml-auto">
          <Button variant="outline" size="sm" onClick={onNavigateToManuscript}>
            <PenLine className="w-4 h-4 mr-1.5" /> 自己写一章
          </Button>
        </div>
      </div>
    </>
  );
}