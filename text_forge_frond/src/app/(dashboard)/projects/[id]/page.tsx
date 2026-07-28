'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ProjectStudio } from '@/features/projects';
import { ProjectGuide } from '@/features/projects';
import { BriefPanel } from '@/features/projects';
import { OutlinePanel } from '@/features/projects';
import { InspirationBoard } from '@/features/projects';
import { ProjectCharactersTab } from '@/features/projects';
import { ProjectExport } from '@/features/projects';
import { WorkbenchTab } from './WorkbenchTab';
import { ProjectDialogs } from './ProjectDialogs';
import { PageHeader } from '@/shared/components';
import { Spinner } from '@/shared/components';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { Button } from '@/components/ui/button';
import { ProcessNav, type ProcessTab } from '@/features/projects';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BUILTIN_WORKFLOW_ID } from '@/types';

import { FileText, ListTree, FileCog, Users, ImageIcon, Clapperboard, BookOpen, Info, Wand2, Check, CheckCircle2, PenLine, Sparkles } from 'lucide-react';
import { useWorkbench } from '@/features/projects';

export default function ProjectWorkbench() {
  const { id: projectId } = useParams<{ id: string }>();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('workbench');
  const wb = useWorkbench(Number(projectId));
  const {
    isLoading,
    showPreviewNote,
    isPreviewMode,
    setShowPreviewNote,
    workflows,
    activeWorkflowId,
    handleBindWorkflow,
    activeWorkflow,
    editingMap,
    savedAt,
    setSeedOpen,
    projectChars,
    creativeSetting,
    outlineReady,
    steps,
    totalWords,
    completedWords,
    bookTitle,
    selectedCharIds,
  } = wb;

  if (isLoading) return <Spinner label="正在加载项目工作台..." />;

  const PROCESS_TABS: ProcessTab[] = [
    { value: 'workbench', label: '工作台', icon: FileText },
    { value: 'outline', label: '大纲', icon: ListTree },
    { value: 'inspiration', label: '章节摘要', icon: FileText },
    { value: 'brief', label: '创作设定', icon: FileCog },
    { value: 'characters', label: '角色', icon: Users },
    { value: 'material', label: '角色素材', icon: ImageIcon },
    { value: 'animation', label: '章节动画', icon: Clapperboard },
  ];

  return (
    <div className="page-shell pb-8 min-h-full">
      <PageHeader
        title="项目工作台"
        description={`${steps.length} 步 · ${totalWords.toLocaleString()} 字（已完成 ${completedWords.toLocaleString()} 字）`}
        actions={<ProjectExport projectId={projectId} compact />}
      />

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
          <Button variant="outline" size="sm" onClick={() => setSeedOpen(true)}>
            <Sparkles className="w-4 h-4 mr-1.5" /> 一句话开局
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push(`/manuscript/${projectId}`)}>
            <PenLine className="w-4 h-4 mr-1.5" /> 自己写一章
          </Button>
        </div>
      </div>

      <ProjectGuide
        onJump={(tab) => setActiveTab(tab)}
        steps={[
          { key: 'brief', label: '创作设定', icon: FileCog, hint: '先写世界观/基调，让AI写作时参考', done: !!creativeSetting?.worldview || !!creativeSetting?.tone, tab: 'brief' },
          { key: 'char', label: '角色', icon: Users, hint: '创建出场角色，生成更贴人物', done: projectChars.length > 0, tab: 'characters' },
          { key: 'outline', label: '大纲', icon: BookOpen, hint: '用大纲规划卷/章/节点，再生成更结构化的正文', done: outlineReady, tab: 'outline' },
          { key: 'gen', label: '生成正文', icon: Wand2, hint: `用「${activeWorkflow?.name ?? '创作流水线'}」产出章节`, done: steps.some((s) => s.content), tab: 'workbench' },
          { key: 'confirm', label: '确认 / 续写', icon: Check, hint: '确认 AI 正文或人写手稿', done: steps.some((s) => s.status === 'completed'), tab: 'workbench' },
        ]}
      />

      <ProcessNav tabs={PROCESS_TABS} value={activeTab} onValueChange={setActiveTab}>
          <ErrorBoundary context={{ module: 'project-workbench', projectId, tab: activeTab }}>
            {activeTab === 'workbench' && (
              <WorkbenchTab
                wb={wb}
                bookId={projectId}
                onNavigateToManuscript={() => router.push(`/manuscript/${projectId}`)}
                onNavigateToCreativeSetting={() => setActiveTab('brief')}
              />
            )}

            <ProjectDialogs wb={wb} />

          {activeTab === 'outline' && <OutlinePanel bookId={projectId} />}
          {activeTab === 'inspiration' && <InspirationBoard projectId={projectId} />}
           {activeTab === 'brief' && <BriefPanel bookId={Number(projectId)} projectTitle={bookTitle} />}
          {activeTab === 'characters' && <ProjectCharactersTab projectId={projectId} />}
          {activeTab === 'material' && <ProjectStudio bookId={Number(projectId)} projectTitle={bookTitle} steps={steps} mode="character" selectedCharIds={selectedCharIds} />}
          {activeTab === 'animation' && <ProjectStudio bookId={Number(projectId)} projectTitle={bookTitle} steps={steps} mode="chapter" selectedCharIds={selectedCharIds} />}
        </ErrorBoundary>
      </ProcessNav>
    </div>
  );
}
