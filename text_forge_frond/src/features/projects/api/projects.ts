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
}

// 书籍生成：统一入口。
export async function generateWithWorkflow(
  bookId: number,
  { workflowId = BUILTIN_WORKFLOW_ID, context, onStep, runOpts, shouldPause, isAborted, workflow }: GenerateOptions & { workflow?: Workflow },
): Promise<Step[]> {
  const wf = workflow ?? (await getWorkflow(workflowId));
  if (!wf) return [];

  const nodeLabelMap = new Map(wf.nodes.map((n) => [n.id, n.label]));
  const resolveLabel = (nodeId: string, fallbackLabel?: string) => nodeLabelMap.get(nodeId) || fallbackLabel || nodeId;
  const visibleNodeIds = new Set(wf.nodes.map((n) => n.id));

  const streamStep: NonNullable<RunWorkflowOptions['onStep']> = (nodeId, label, output, systemPrompt, status) => {
    const resolved = resolveLabel(nodeId, label);
    const step = runStepToStreamStep({ nodeId, label: resolved, output, status: status ?? 'done', systemPrompt });
    if (step) onStep?.(step);
    runOpts?.onStep?.(nodeId, resolved, output, systemPrompt);
  };

  const runs = await runWorkflow(
    workflowId,
    context?.outline ?? '',
    { bookId, ...runOpts, shouldPause, isAborted, onStep: streamStep, visibleNodeIds },
    context,
  );
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
