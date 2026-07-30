import { Book, CreateBookRequest, BUILTIN_WORKFLOW_ID, type GenerationContext, type Step } from '@/types';
import apiClient from '@/shared/lib/apiClient';
import { getWorkflow, runWorkflow, workflowToSteps, type RunWorkflowOptions, type WorkflowRunStep, type Workflow } from '@/features/workflow';

export interface CreateBookResponse extends Book {
  version?: number;
}

export interface BookListResponse {
  books: Book[];
}

export interface BookResponse {
  book: Book;
}

export interface CharactersResponse {
  characters?: { id: number; name: string; description: string }[];
}

export interface BookContextConfig {
  character_ids: number[];
  chapter_content_ids: number[];
  chapter_summary_ids: number[];
  volume_ids: number[];
  outline_node_ids: number[];
}

export interface VolumeListItem {
  id: number;
  title: string;
  summary?: string;
  sort_order: number;
}

export interface ChapterListItem {
  id: number;
  title: string;
  summary?: string;
  sort_order: number;
}

export interface VolumeChapterTree {
  id: number;
  title: string;
  summary?: string;
  chapters: ChapterListItem[];
}

export interface OutlineNode {
  id: number;
  node_type: string;
  title: string;
  content?: string;
  parent_id?: number | null;
  target_volume_id?: number | null;
  target_chapter_id?: number | null;
  sort_order: number;
}

export async function fetchBooks(): Promise<Book[]> {
  const { data } = await apiClient.get<BookListResponse>('/api/books');
  return data.books || [];
}

export async function createBook(body: CreateBookRequest, version?: number): Promise<Book & { version?: number }> {
  const config = version ? { headers: { 'If-Match': String(version) } } : undefined;
  const { data } = await apiClient.post<Book>('/api/books', body, config);
  return { ...data, version };
}

export async function deleteBook(id: number, version?: number): Promise<void> {
  await apiClient.delete(`/api/books/${id}`, version ? { headers: { 'If-Match': String(version) } } : undefined);
}

export interface UpdateBookPayload {
  title?: string;
  description?: string;
  genre?: string;
  totalWordGoal?: number;
}

export async function updateBook(id: number, payload: UpdateBookPayload): Promise<Book> {
  const { data } = await apiClient.patch<Book>(`/api/books/${id}`, payload);
  return data;
}

export interface BookDetail {
  book: Book;
  characters?: { id: number; name: string; description: string }[];
}

export async function fetchBookMeta(id: number): Promise<BookDetail['book']> {
  const { data } = await apiClient.get<BookResponse>(`/api/books/${id}`);
  return (
    data.book || {
      id,
      title: '',
      description: '',
      genre: '',
      pinned: false,
      createdAt: '',
      updatedAt: '',
    }
  );
}

export async function fetchBookCharacters(id: number): Promise<NonNullable<BookDetail['characters']>> {
  const { data } = await apiClient.get(`/api/books/${id}/characters`);
  return data.characters || [];
}

export async function fetchBookVolumes(id: number): Promise<VolumeListItem[]> {
  const { data } = await apiClient.get<{ volumes: VolumeListItem[] }>(`/api/books/${id}/volumes`);
  return data.volumes || [];
}

export async function fetchBookChaptersTree(id: number): Promise<VolumeChapterTree[]> {
  const { data } = await apiClient.get<{ volumes: VolumeChapterTree[] }>(`/api/books/${id}/chapters`);
  return data.volumes || [];
}

export async function fetchBookOutlineTree(id: number): Promise<OutlineNode[]> {
  const { data } = await apiClient.get<{ nodes: OutlineNode[] }>(`/api/books/${id}/outline-tree`);
  return data.nodes || [];
}

export async function fetchBookContextConfig(id: number): Promise<BookContextConfig> {
  const { data } = await apiClient.get<BookContextConfig>(`/api/books/${id}/context-config`);
  return data;
}

export async function saveBookContextConfig(id: number, config: BookContextConfig): Promise<BookContextConfig> {
  const { data } = await apiClient.put<BookContextConfig>(`/api/books/${id}/context-config`, config);
  return data;
}

/** 把书籍绑定到某条创作流水线（工作流 id；省略则回退内置流水线） */
export async function bindWorkflow(bookId: number, workflowId: string = BUILTIN_WORKFLOW_ID): Promise<void> {
  await apiClient.put(`/api/books/${bookId}`, { workflow_id: workflowId }).catch(() => {});
}

export interface GenerateOptions {
  workflowId?: string;
  context?: GenerationContext;
  onStep?: (step: Step) => void;
  runOpts?: RunWorkflowOptions;
  shouldPause?: () => boolean;
  isAborted?: () => boolean;
  signal?: AbortSignal;
}

// 书籍生成：统一入口。
export async function generateWithWorkflow(
  bookId: number,
  { workflowId = BUILTIN_WORKFLOW_ID, context, onStep, runOpts, shouldPause, isAborted, signal, workflow }: GenerateOptions & { workflow?: Workflow },
): Promise<Step[]> {
  const wf = workflow ?? (await getWorkflow(workflowId));
  if (!wf) return [];

  const nodeLabelMap = new Map(wf.nodes.map((n) => [n.id, n.label]));
  const resolveLabel = (nodeId: string, fallbackLabel?: string) => nodeLabelMap.get(nodeId) || fallbackLabel || nodeId;
  const labelToIdMap = new Map(wf.nodes.map((n) => [n.label, n.id]));
  const visibleNodeIds = new Set(wf.nodes.map((n) => n.id));

  const streamStep: NonNullable<RunWorkflowOptions['onStep']> = (nodeId, label, output, systemPrompt, status) => {
    const resolved = resolveLabel(nodeId, label);
    const step = runStepToStreamStep({ nodeId, label: resolved, output, status: status ?? 'done', systemPrompt });
    if (step) onStep?.(step);
    runOpts?.onStep?.(nodeId, resolved, output, systemPrompt);
  };

  const runs = await runWorkflow(workflowId, {
    bookId,
    ...runOpts,
    shouldPause,
    isAborted,
    signal,
    onStep: streamStep,
    visibleNodeIds,
    labelToIdMap,
    projectContext: context,
  });
  const runsWithLabel = runs.map((r) => ({
    ...r,
    label: nodeLabelMap.get(r.nodeId) || r.label,
  }));
  return workflowToSteps(runsWithLabel);
}

function runStepToStreamStep(run: WorkflowRunStep): Step | null {
  if (!run.nodeId) return null;
  const statusMap: Record<string, Step['status']> = {
    running: 'streaming',
    done: 'completed',
    error: 'failed',
  };
  return {
    id: `step-${run.nodeId}-${Date.now()}`,
    agent: run.nodeId,
    agentName: run.label,
    content: run.output,
    status: statusMap[run.status] ?? 'completed',
    nodeId: run.nodeId,
  };
}

/** 把一段正文转为工作台 step（手稿 → 工作台 互导）。 */
export function buildStepFromManuscript(bookId: number, title: string, content: string): Step {
  return {
    id: `step-manuscript-${Date.now()}`,
    agent: 'writer',
    content: `# ${title}\n\n${content}`,
    status: 'completed',
  };
}

// 把整本书（已拆好的章节）转为工作台 steps（completed），
// 让工作台「续写下一章」能把这些已导入章节当作上下文注入 Agent 流。
export function buildBookSteps(
  bookId: number,
  chapters: { title: string; content: string }[],
): Step[] {
  return chapters.map((c, i) => ({
    id: `step-book-${Date.now()}-${i}`,
    agent: 'writer',
    content: `# ${c.title}\n\n${c.content}`,
    status: 'completed',
  }));
}

export interface ExportBookOptions {
  fmt?: 'md' | 'txt' | 'epub' | 'pdf';
  includeOutline?: boolean;
  includeCharacters?: boolean;
  volumeIds?: number[];
}

export async function exportBook(bookId: number, options: ExportBookOptions = {}): Promise<Blob> {
  const { fmt = 'md', includeOutline = false, includeCharacters = false, volumeIds } = options;
  const params = new URLSearchParams({ fmt });
  if (includeOutline) params.set('include_outline', 'true');
  if (includeCharacters) params.set('include_characters', 'true');
  if (volumeIds && volumeIds.length > 0) params.set('volume_ids', volumeIds.join(','));
  
  const response = await fetch(`/api/books/${bookId}/export?${params.toString()}`, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });
  
  if (!response.ok) {
    throw new Error(`导出失败: ${response.statusText}`);
  }
  
  return response.blob();
}
