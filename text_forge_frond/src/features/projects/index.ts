// features/projects 公开 API。
// 其它切片/页面只应从 '@/features/projects' 消费，禁止深路径直连内部文件。

// ---- UI 组件 ----
export { BriefPanel } from './ui/BriefPanel';
export { ChapterAnimationPanel } from './ui/ChapterAnimationPanel';
export { CharacterCard } from './ui/CharacterCard';
export { CharacterDetailSheet } from './ui/CharacterDetailSheet';
export { CharacterMaterialPanel } from './ui/CharacterMaterialPanel';
export { CharacterRelationsSheet } from './ui/CharacterRelationsSheet';
export { CharacterStatusSheet } from './ui/CharacterStatusSheet';
export { InspirationBoard } from './ui/InspirationBoard';
export { OutlinePanel } from './ui/OutlinePanel';
export { PortfolioGallery } from './ui/PortfolioGallery';
export { PortfolioGrid } from './ui/PortfolioGrid';
export { ProcessNav } from './ui/ProcessNav';
export { ProjectCard } from './ui/ProjectCard';
export { ProjectCharactersTab } from './ui/ProjectCharactersTab';
export { ProjectExport } from './ui/ProjectExport';
export { ProjectGuide } from './ui/ProjectGuide';
export { ProjectStudio } from './ui/ProjectStudio';
export { StepCard } from './ui/StepCard';
export { WorkflowGraph } from './ui/WorkflowGraph';

// ---- Hooks ----
export { useProjectCharacters } from './hooks/useProjectCharacters';
export { useProjectCharactersTab } from './hooks/useProjectCharactersTab';
export { useWorkbench } from './hooks/useWorkbench';
export {
  makeBuildContext,
  makeSummarizePlot,
  makeDepositCharacterProfiles,
} from './hooks/workbenchContext';
export { makeGeneration } from './hooks/workbenchGenerate';
export { makeSeedActions } from './hooks/workbenchSeed';

// ---- API ----
export {
  fetchProjects,
  createProject,
  deleteProject,
  fetchProjectDetail,
  fetchProjectMeta,
  fetchProjectCharacters,
  confirmStep,
  saveStepEdit,
  bindWorkflow,
  generateWithWorkflow,
  importManuscriptToProject,
  importBookToProject,
} from './api/projects';
export type {
  CreateProjectResponse,
  ProjectListResponse,
  ProjectResponse,
  StepsResponse,
  CharactersResponse,
  ProjectDetail,
  GenerateOptions,
} from './api/projects';

// ---- Stores ----
export { useProjectStore } from './stores/projectStore';
export { usePortfolioStore } from './stores/portfolioStore';
export { useBriefStore, briefToContextLine, briefSectionsToContext } from './stores/briefStore';

// ---- 类型 ----
export type { ProcessTab } from './ui/ProcessNav';
