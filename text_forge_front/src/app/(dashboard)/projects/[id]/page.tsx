'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { FileCog, Users, BookOpen, Check, Wand2 } from 'lucide-react';
import { ProjectStudio } from '@/features/projects';
import { ProjectGuide } from '@/features/projects';
import { BriefPanel } from '@/features/projects';
import { OutlinePanel } from '@/features/projects';
import { InspirationBoard } from '@/features/projects';
import { ProjectCharactersTab } from '@/features/projects';
import { ProjectExport } from '@/features/projects';
import { WorkbenchTab } from './WorkbenchTab';
import { ProjectContextConfigTab } from '@/features/projects';
import { ProjectDialogs } from './ProjectDialogs';
import { StatsTab } from '@/features/projects/ui/StatsTab';
import { AgentRulesSettings, WorldSettings } from '@/features/world';
import { PageHeader } from '@/shared/components';
import { Spinner } from '@/shared/components';
import { ErrorBoundary } from '@/shared/components/ErrorBoundary';
import { ProcessNav } from '@/features/projects';
import { PROJECT_TABS } from '@/features/projects';
import { ProjectToolbar } from '@/features/projects';
import { useWorkbench } from '@/features/projects';

export default function ProjectWorkbench() {
  const { id: projectId } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState('workbench');
  const wb = useWorkbench(Number(projectId));
  const {
    isLoading, showPreviewNote, isPreviewMode, setShowPreviewNote,
    workflows, activeWorkflowId, handleBindWorkflow, activeWorkflow,
    editingMap, savedAt, projectChars, creativeSetting, outlineReady,
    steps, totalWords, completedWords, bookTitle, selectedCharIds,
  } = wb;

  if (isLoading) return <Spinner label="正在加载项目工作台..." />;

  return (
    <div className="page-shell pb-8 min-h-full">
      <PageHeader
        title="项目工作台"
        description={`${steps.length} 步 · ${totalWords.toLocaleString()} 字（已完成 ${completedWords.toLocaleString()} 字）`}
        actions={<ProjectExport projectId={projectId} compact />}
      />

      <ProjectToolbar
        projectId={projectId}
        onNavigateToManuscript={() => { window.location.href = `/manuscript/${projectId}`; }}
        onNavigateToCreativeSetting={() => setActiveTab('brief')}
      />

      <ProjectGuide
        onJump={setActiveTab}
        steps={[
          { key: 'brief', label: '创作设定', icon: FileCog, hint: '先写世界观/基调，让AI写作时参考', done: !!creativeSetting?.worldview || !!creativeSetting?.tone, tab: 'brief' },
          { key: 'char', label: '角色', icon: Users, hint: '创建出场角色，生成更贴人物', done: projectChars.length > 0, tab: 'characters' },
          { key: 'outline', label: '大纲', icon: BookOpen, hint: '用大纲规划卷/章/节点，再生成更结构化的正文', done: outlineReady, tab: 'outline' },
          { key: 'gen', label: '生成正文', icon: Wand2, hint: `用「${activeWorkflow?.name ?? '创作流水线'}」产出章节`, done: steps.some((s) => s.content), tab: 'workbench' },
          { key: 'confirm', label: '确认 / 续写', icon: Check, hint: '确认 AI 正文或人写手稿', done: steps.some((s) => s.status === 'completed'), tab: 'workbench' },
        ]}
      />

      <ProcessNav tabs={PROJECT_TABS} value={activeTab} onValueChange={setActiveTab}>
        <ErrorBoundary context={{ module: 'project-workbench', projectId, tab: activeTab }}>
          {activeTab === 'workbench' && (
            <WorkbenchTab
              wb={wb}
              bookId={projectId}
              onNavigateToManuscript={() => { window.location.href = `/manuscript/${projectId}`; }}
              onNavigateToCreativeSetting={() => setActiveTab('brief')}
            />
          )}
          <ProjectDialogs wb={wb} />

          {activeTab === 'outline' && <OutlinePanel bookId={projectId} />}
          {activeTab === 'inspiration' && <InspirationBoard projectId={projectId} />}
          {activeTab === 'brief' && <BriefPanel bookId={Number(projectId)} projectTitle={bookTitle} />}
          {activeTab === 'characters' && <ProjectCharactersTab projectId={Number(projectId)} />}
          {activeTab === 'context' && <ProjectContextConfigTab projectId={Number(projectId)} />}
          {activeTab === 'material' && <ProjectStudio bookId={Number(projectId)} projectTitle={bookTitle} steps={steps} mode="character" selectedCharIds={selectedCharIds} />}
          {activeTab === 'animation' && <ProjectStudio bookId={Number(projectId)} projectTitle={bookTitle} steps={steps} mode="chapter" selectedCharIds={selectedCharIds} />}
          {activeTab === 'stats' && <StatsTab bookId={Number(projectId)} />}
          {activeTab === 'world-building' && <WorldSettings bookId={Number(projectId)} />}
          {activeTab === 'agent-rules' && <AgentRulesSettings bookId={Number(projectId)} />}
        </ErrorBoundary>
      </ProcessNav>
    </div>
  );
}