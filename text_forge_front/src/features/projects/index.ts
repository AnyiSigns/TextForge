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

export { ProcessNav } from './ui/ProcessNav';
export { ProjectCard } from './ui/ProjectCard';
export { ProjectCharactersTab } from './ui/ProjectCharactersTab';
export { ProjectExport } from './ui/ProjectExport';
export { ProjectGuide } from './ui/ProjectGuide';
export { ProjectStudio } from './ui/ProjectStudio';
export { ProjectToolbar } from './ui/ProjectToolbar';
export { StepCard } from './ui/StepCard';
export { MainTextTargetDialog } from './ui/MainTextTargetDialog';
export { WorkflowGraph } from './ui/WorkflowGraph';
export { ProjectContextConfigTab } from './ui/ProjectContextConfigTab';

// ---- Hooks ----
export { useOutline } from './hooks/useOutline';
export { useProjectCharacters } from './hooks/useProjectCharacters';
export { useProjectCharactersTab } from './hooks/useProjectCharactersTab';
export { useWorkbench } from './hooks/useWorkbench';
export {
  makeBuildContext,
  makeSummarizePlot,
  makeDepositCharacterProfiles,
} from './hooks/workbenchContext';
export { makeGeneration } from './hooks/workbenchGenerate';

// ---- API ----
export {
  fetchBooks,
  createBook,
  deleteBook,
  updateBook,
  fetchBookMeta,
  fetchBookCharacters,
  fetchBookVolumes,
  fetchBookChaptersTree,
  fetchBookOutlineTree,
  fetchBookContextConfig,
  saveBookContextConfig,
  bindWorkflow,
  generateWithWorkflow,
  buildStepFromManuscript,
  buildBookSteps,
} from './api/projects';
export {
  listOutlines,
  getOutline,
  createOutline,
  updateOutline,
  deleteOutline,
} from './api/outline';
export {
  listVolumes,
  createVolume,
  updateVolume,
  deleteVolume,
} from './api/volumes';
export {
  listChapters,
  createChapter,
  updateChapter,
  deleteChapter,
} from './api/chapters';
export {
  listChapterContents,
  getLatestChapterContent,
  createChapterContent,
} from './api/chapterContents';
export {
  getCreativeSetting,
  updateCreativeSetting,
} from './api/creativeSettings';
export type {
  ListOutlinesResponse,
  OutlineItem,
} from './api/outline';
export type {
  ListVolumesResponse,
  Volume,
  VolumeRequest,
} from './api/volumes';
export type {
  ListChaptersResponse,
  Chapter,
  ChapterRequest,
} from './api/chapters';
export type {
  ListChapterContentsResponse,
  ChapterContent,
  ChapterContentRequest,
} from './api/chapterContents';
export type {
  CreativeSettingResponse,
} from './api/creativeSettings';
export type {
  BookListResponse,
  BookResponse,
  BookDetail,
  CharactersResponse,
  BookContextConfig,
  OutlineNode,
  VolumeListItem,
  ChapterListItem,
  VolumeChapterTree,
  GenerateOptions,
} from './api/projects';

// ---- Stores ----
export { useBookStore, useProjectStore } from './stores/bookStore';
export { useCreativeSettingStore, creativeSettingToContextLine, creativeSettingDimensionsToContext } from './stores/creativeSettingStore';

// ---- 类型 ----
export type { ProcessTab } from './ui/ProcessNav';

// ---- 常量 ----
export { PROJECT_TABS } from './PROJECT_TABS';
