'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { WorkflowGraph } from '@/components/projects/WorkflowGraph';
import { StepCard } from '@/components/projects/StepCard';
import { ProjectStudio } from '@/components/projects/ProjectStudio';
import { ProjectGuide } from '@/components/projects/ProjectGuide';
import { BriefPanel } from '@/components/projects/BriefPanel';
import { OutlinePanel } from '@/components/projects/OutlinePanel';
import { InspirationBoard } from '@/components/projects/InspirationBoard';
import { ProjectCharactersTab } from '@/components/projects/ProjectCharactersTab';
import { ProjectExport } from '@/components/projects/ProjectExport';
import { PageHeader } from '@/components/shared/PageHeader';
import { Spinner, EmptyState } from '@/components/shared/states';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { ProcessNav, type ProcessTab } from '@/components/projects/ProcessNav';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

import { Send, Pause, Play, FileText, ListTree, Lightbulb, FileCog, Users, Layers, Check, Wand2, Info, PenLine, CheckCircle2, Image as ImageIcon, Clapperboard, BookOpen, Sparkles, Loader2 } from 'lucide-react';
import { useWorkbench } from '@/lib/hooks/useWorkbench';

export default function ProjectWorkbench() {
  const { id: projectId } = useParams<{ id: string }>();
  const [activeTab, setActiveTab] = useState('workbench');
  const {
    brief,
    projectChars,
    isPreviewMode,
    isLoading,
    showPreviewNote,
    setShowPreviewNote,
    seeded,
    seedOpen,
    setSeedOpen,
    isGraphOpen,
    setIsGraphOpen,
    isStreaming,
    isPaused,
    setIsPaused,
    pausedRef,
    steps,
    editingMap,
    savedAt,
    handleEditStart,
    handleEditCancel,
    handleSaveEdit,
    handleConfirm,
    handleSkip,
    handleSendToManuscript,
    currentAgent,
    handleGenerate,
    aiDialog,
    setAiDialog,
    handleAiAction,
    applyAiResult,
    selectedCharIds,
    selectedSectionIds,
    toggleChar,
    toggleSection,
    workflows,
    activeWorkflowId,
    activeWorkflow,
    handleBindWorkflow,
    outlineReady,
    scrollRef,
    seedPrompt,
    setSeedPrompt,
    isSeeding,
    handleSeed,
    handleWriteFirstChapter,
    projectTitle,
    totalWords,
    completedWords,
  } = useWorkbench(projectId);

  if (isLoading) return <Spinner label="正在加载项目工作台..." />;

  const PROCESS_TABS: ProcessTab[] = [
    { value: 'workbench', label: '工作台', icon: FileText },
    { value: 'outline', label: '大纲', icon: ListTree },
    { value: 'inspiration', label: '灵感', icon: Lightbulb },
    { value: 'brief', label: '创作设定', icon: FileCog },
    { value: 'characters', label: '角色', icon: Users },
    { value: 'material', label: '角色素材', icon: ImageIcon },
    { value: 'animation', label: '章节动画', icon: Clapperboard },
  ];

  const togglePause = () => {
    setIsPaused((p) => {
      const next = !p;
      pausedRef.current = next;
      return next;
    });
  };

  return (
    <div className="page-shell pb-8 min-h-full">
      <PageHeader
        title="项目工作台"
        description={`${steps.length} 步 · ${totalWords.toLocaleString()} 字（已完成 ${completedWords.toLocaleString()} 字）`}
        actions={<ProjectExport projectId={projectId} compact />}
      />

      {/* 预览模式提示：后端未就绪时生成的是本地示例，非 AI 真写 */}
      {showPreviewNote && isPreviewMode && (
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2.5 text-xs text-amber-700 dark:text-amber-300">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="flex-1">
            当前为<strong>预览模式</strong>：下方「生成」产出的是本地示例内容（占位），并非 AI 真正写作。配置后端地址 / 模型密钥后，这里才会由 AI 按你的设定生成正文。你也可以直接点「写第一章」自己动手写。
          </p>
          <button onClick={() => setShowPreviewNote(false)} className="shrink-0 text-amber-600/70 hover:text-amber-700 dark:hover:text-amber-200 underline-offset-2 hover:underline">知道了</button>
        </div>
      )}

      {/* 创作流水线选择器：内置 / 用户工作流（多模板应用） */}
      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <span className="text-xs text-muted-foreground flex items-center gap-1.5">
          <Wand2 className="w-3.5 h-3.5" /> 创作流水线
        </span>
        <Select value={activeWorkflowId} onValueChange={handleBindWorkflow}>
          <SelectTrigger className="w-[220px]"><SelectValue>{(v: string) => workflows.find((w) => w.id === v)?.name ?? v}</SelectValue></SelectTrigger>
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
        {/* 4.3 工作台自动保存安心感：编辑中提示停笔自动留底，保存后常驻"已自动保存" */}
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
          <Button variant="outline" size="sm" onClick={handleWriteFirstChapter}>
            <PenLine className="w-4 h-4 mr-1.5" /> 自己写一章
          </Button>
        </div>
      </div>

      {/* 步骤引导：根据数据状态高亮「下一步」 */}
      <ProjectGuide
        onJump={(tab) => setActiveTab(tab)}
        steps={[
          { key: 'brief', label: '创作设定', icon: FileCog, hint: '先写世界观/基调，注入生成', done: !!brief?.worldview || !!brief?.tone, tab: 'brief' },
          { key: 'char', label: '角色', icon: Users, hint: '创建出场角色，生成更贴人物', done: projectChars.length > 0, tab: 'characters' },
          { key: 'outline', label: '大纲', icon: BookOpen, hint: '用大纲规划卷/章/节点，再生成更结构化的正文', done: outlineReady, tab: 'outline' },
          { key: 'gen', label: '生成正文', icon: Wand2, hint: `用「${activeWorkflow?.name ?? '创作流水线'}」产出章节`, done: steps.some((s) => s.content), tab: 'workbench' },
          { key: 'confirm', label: '确认 / 续写', icon: Check, hint: '确认 AI 正文或人写手稿', done: steps.some((s) => s.status === 'completed'), tab: 'workbench' },
        ]}
      />

      <ProcessNav tabs={PROCESS_TABS} value={activeTab} onValueChange={setActiveTab}>
        {activeTab === 'workbench' && (
          <>
            {/* 章节级上下文选择器：出场角色 + 相关设定维度 */}
            <div className="grid sm:grid-cols-2 gap-4 mb-4">
              <Card className="glass-card">
                <CardContent className="pt-4 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Users className="w-3.5 h-3.5" /> 本章出场角色</p>
                  {projectChars.length === 0 ? (
                    <p className="text-xs text-muted-foreground">暂无角色，去「角色」标签创建。</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {projectChars.map((c) => {
                        const on = selectedCharIds.includes(c.id);
                        return (
                          <button key={c.id} onClick={() => toggleChar(c.id)}
                            className={`px-2.5 py-1 rounded-full text-xs border flex items-center gap-1 ${on ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50'}`}>
                            {on && <Check className="w-3 h-3" />} {c.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="glass-card">
                <CardContent className="pt-4 space-y-2">
                  <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5"><Layers className="w-3.5 h-3.5" /> 本章相关设定维度</p>
                  {(brief?.sections ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">暂无自定义维度，去「创作设定」添加（势力/战力/阵营…）。</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {brief!.sections!.map((sec) => {
                        const on = selectedSectionIds.includes(sec.id);
                        return (
                          <button key={sec.id} onClick={() => toggleSection(sec.id)}
                            className={`px-2.5 py-1 rounded-full text-xs border flex items-center gap-1 ${on ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:border-primary/50'}`}>
                            {on && <Check className="w-3 h-3" />} {sec.title}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <WorkflowGraph
              steps={steps}
              currentAgent={currentAgent}
              isOpen={isGraphOpen}
              onToggle={() => setIsGraphOpen(o => !o)}
              workflow={activeWorkflow}
              workflowName={activeWorkflow?.name}
            />

            {/* 首次进入空态引导：一句话开局 + 手动引导 */}
            {steps.length === 0 && !brief?.worldview && projectChars.length === 0 && (
              <div className="my-4 space-y-4">
                {/* 一句话开局卡片 */}
                <Card className="glass-card border-primary/40">
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <Sparkles className="w-4 h-4 text-primary" />
                      一句话开局
                    </div>
                    <p className="text-xs text-muted-foreground">
                      输入一句话（如「一艘拾荒船打捞星海记忆的科幻故事」），自动生成世界观、角色与大纲，再进流水线写正文。
                    </p>
                    <Button size="sm" onClick={() => setSeedOpen(true)}>
                      <Sparkles className="w-4 h-4 mr-1.5" /> 一句话开局
                    </Button>
                    {seeded && (
                      <div className="flex items-start gap-2 rounded-lg bg-primary/10 border border-primary/30 p-2.5 text-xs text-primary/90">
                        <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                        <span>已生成世界/角色/大纲，默认可编辑。建议<strong>先改一处</strong>（如世界观或主角名），让它更像你的作品，再去「生成正文」。</span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <EmptyState
                  icon={Wand2}
                  title="或手动开始"
                  description="按引导四步走：①写创作设定 ②建角色 ③选流水线生成 ④确认/续写。随时可去「手稿」自己写。"
                  action={
                    <div className="flex gap-2 justify-center flex-wrap">
                      <Button size="sm" onClick={handleWriteFirstChapter}><PenLine className="w-4 h-4 mr-1.5" /> 直接写第一章</Button>
                      <Button size="sm" variant="outline" onClick={() => setActiveTab('brief')}><FileCog className="w-4 h-4 mr-1.5" /> 写创作设定</Button>
                      <Button size="sm" variant="outline" onClick={() => handleGenerate}><Wand2 className="w-4 h-4 mr-1.5" /> AI 生成</Button>
                    </div>
                  }
                />
              </div>
            )}

            <div className="mt-4 pr-4" ref={scrollRef}>
              <div className="space-y-4 pb-4">
                {steps.length === 0 && (
                  <EmptyState
                    icon={FileText}
                    title="还没有内容"
                    description="点击下方按钮开始生成小说"
                  />
                )}
                {steps.map((step, index) => (
                  <StepCard
                    key={step.id}
                    step={step}
                    index={index}
                    isLast={index === steps.length - 1}
                    isEditing={editingMap[step.id] !== undefined}
                    editContent={editingMap[step.id] ?? ''}
                    onEditChange={(v) => handleEditStart(step.id, v)}
                    onEditStart={(content) => handleEditStart(step.id, content)}
                    onEditCancel={() => handleEditCancel(step.id)}
                    onSaveEdit={handleSaveEdit}
                    onConfirm={handleConfirm}
                    onSendToManuscript={handleSendToManuscript}
                    onSkip={handleSkip}
                    onRetry={handleConfirm}
                    onAiAction={handleAiAction}
                  />
                ))}
              </div>
            </div>

            <div className="border-t border-border/40 pt-4 mt-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {isStreaming ? (
                  <Button variant="outline" size="sm" onClick={togglePause}>
                    {isPaused ? <Play className="w-4 h-4 mr-2" /> : <Pause className="w-4 h-4 mr-2" />}
                    {isPaused ? '继续' : '暂停'}
                  </Button>
                ) : (
                  <>
                    {steps.some(s => s.status === 'waiting') ? (
                      <Button size="sm" onClick={handleGenerate}>
                        <Send className="w-4 h-4 mr-2" /> 继续生成
                      </Button>
                    ) : steps.some(s => s.status === 'completed') ? (
                      <Button size="sm" onClick={handleGenerate}>
                        <Send className="w-4 h-4 mr-2" /> 续写下一章
                      </Button>
                    ) : (
                      <Button size="sm" onClick={handleGenerate}>
                        <Send className="w-4 h-4 mr-2" /> 开始生成
                      </Button>
                    )}
                    {steps.some(s => s.status === 'completed') && (
                      <span className="text-xs text-muted-foreground">正文已生成，可「确认继续」或去「手稿」自己改</span>
                    )}
                  </>
                )}
              </div>
              <span className="text-xs text-muted-foreground">
                {steps.length} 步 · {steps.filter(s => s.status === 'completed').length} 已完成
              </span>
            </div>
          </>
        )}

        <Dialog open={aiDialog.open} onOpenChange={(open) => setAiDialog((d) => ({ ...d, open }))}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>AI 生成结果</DialogTitle>
              <DialogDescription>选择如何应用到该步骤正文</DialogDescription>
            </DialogHeader>
            <div className="max-h-48 overflow-auto rounded-lg border border-border/40 bg-muted/30 p-3 text-xs whitespace-pre-wrap">
              {aiDialog.result}
            </div>
            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="outline" onClick={() => applyAiResult('copy')}>复制</Button>
              <Button size="sm" variant="outline" onClick={() => applyAiResult('append')}>追加</Button>
              <Button size="sm" onClick={() => applyAiResult('replace')}>替换</Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={seedOpen} onOpenChange={setSeedOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" /> 一句话开局</DialogTitle>
              <DialogDescription>输入一句话（如「一艘拾荒船打捞星海记忆的科幻故事」），自动生成世界观、角色与大纲，再进流水线写正文。</DialogDescription>
            </DialogHeader>
            <Input
              value={seedPrompt}
              onChange={(e) => setSeedPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSeed(); }}
              placeholder="用一句话描述你想写的小说…"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setSeedOpen(false)}>取消</Button>
              <Button size="sm" onClick={handleSeed} disabled={isSeeding || !seedPrompt.trim()}>
                {isSeeding ? <Loader2 className="w-4 h-4 mr-1.5 animate-spin" /> : <Sparkles className="w-4 h-4 mr-1.5" />}
                {isSeeding ? '生成中…' : '开局'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {activeTab === 'outline' && <OutlinePanel projectId={projectId} />}
        {activeTab === 'inspiration' && <InspirationBoard projectId={projectId} />}
        {activeTab === 'brief' && <BriefPanel projectId={projectId} projectTitle={projectTitle} />}
        {activeTab === 'characters' && <ProjectCharactersTab projectId={projectId} />}
        {activeTab === 'material' && <ProjectStudio projectId={projectId} steps={steps} mode="character" selectedCharIds={selectedCharIds} />}
        {activeTab === 'animation' && <ProjectStudio projectId={projectId} steps={steps} mode="chapter" selectedCharIds={selectedCharIds} />}
      </ProcessNav>
    </div>
  );
}
