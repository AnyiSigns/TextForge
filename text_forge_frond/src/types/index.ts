// Model categories the app routes by (functional names)
export type ModelCategory = 'llm' | 'vision' | 'omni' | 'speech' | 'embedding';

// Where the model runs
export type ModelDeployment = 'cloud' | 'local';

// Tells the backend which library/adapter to use (decouples UI from per-vendor libs)
export type AdapterType =
  | 'openai'
  | 'anthropic'
  | 'dashscope' // 阿里通义千问
  | 'wenxin' // 百度文心
  | 'deepseek'
  | 'gemini'
  | 'ollama' // 本地
  | 'lmstudio' // 本地
  | 'vllm' // 本地
  | 'comfyui' // 本地视频/图像
  | 'kling' // 可灵
  | 'runway'
  | 'luma'
  | 'jimeng' // 即梦
  | 'bge' // 本地嵌入
  | 'cohere'
  | 'jina'
  | 'custom';

// Auxiliary model: a secondary llm role used by a primary text model
export interface AuxiliaryModel {
  id: string;
  role: 'planner' | 'critic' | 'summarizer' | 'reviewer' | 'translator' | 'custom';
  label: string;
  modelRef: string; // id of another text model, or inline model id
  enabled: boolean;
}

export type ModelModality = 'image' | 'video';

export interface ModelConfig {
  id: string;
  name: string;
  category: ModelCategory;
  deployment: ModelDeployment;
  vendor: string; // e.g. 'OpenAI', 'Ollama', 'Kling'
  adapter: AdapterType;
  baseUrl?: string;
  apiKey?: string;
  modelId: string; // actual model name passed to backend
  isDefault?: boolean;
  extra?: Record<string, string | number>;
  auxiliary?: AuxiliaryModel[]; // only for category 'text'
  modalities?: ModelModality[]; // 支持的能力：图片/视频（仅 vision/omni 有意义）
  createdAt: string;
}

export interface Project {
  id: string;
  title: string;
  status: 'draft' | 'generating' | 'completed' | 'paused';
  genre?: string;
  description?: string;
  pinned?: boolean;
  /** 绑定的创作流水线（工作流 id）；缺省使用内置创作流水线 BUILTIN_WORKFLOW_ID */
  workflowId?: string;
  createdAt: string;
  updatedAt: string;
}

/** 内置创作流水线 id（项目默认使用的多 Agent 生成流程） */
export const BUILTIN_WORKFLOW_ID = 'builtin-novel-pipeline';
export type WorkflowRef = string; // 工作流 id（含内置 id）

// API 统一响应包装
export interface ApiResponse<T = unknown> {
  data?: T;
  error?: string;
  message?: string;
}

// API 请求体类型
export interface CreateProjectRequest {
  title: string;
  description: string;
  genre: string;
  version?: number;
}

export interface UpdateBriefRequest {
  brief: ProjectBrief;
}

export interface ChatMessageRequest {
  message: string;
  project_id?: string;
  brief?: string;
  character_name?: string;
  character_description?: string;
  // 最近历史上下文（后端无状态时需回传以维持连贯对话）
  messages?: { role: 'user' | 'assistant'; content: string }[];
}

// Structured project context the workbench injects into the request so the
// backend can bias the generation (and for traceability / portfolio write-back).
//
// 上下文策略（章节级，控制成本 + 把控全局）：
// - brief：常驻注入世界观 + 用户 pinned 的自定义设定维度（势力/战力/阵营…）
// - plot_summary：性价比 summarizer 模型压缩后的滚动剧情摘要（非原始全文）
// - characters：仅「本章出场角色 + 状态变化角色」，每人带当前时间点快照
// - sections：本章按需挑选的相关自定义维度（与 brief 互补，避免全量注入）
export interface GenerationContextCharacterRelation {
  /** 对端角色名（折叠时已由前端解析，后端无需再反查 id） */
  target: string;
  /** 关系描述：如「宿敌」「师徒」「暗恋」 */
  relation: string;
}

export interface GenerationContextCharacter {
  name: string;
  /** 故事定位：主角/女主/反派/配角…或自定义文案（生成时用来把控戏份权重） */
  role?: string;
  description: string;        // 静态人设（可压缩）
  currentProfile?: string;    // 当前时间点详情（心理/关系/处境/变化）
  status: string;             // 存活/死亡/自定义（string 支持任意状态）
  change?: string;            // 本章状态变化强信号，如「刚死亡」「刚叛变」
  /** 角色关系链：与谁、什么关系（结构化，便于后端做关系张力提示） */
  relationships?: GenerationContextCharacterRelation[];
}

export interface GenerationContextCharacterRelation {
  /** 对端角色名（折叠时已由前端解析，后端无需再反查 id） */
  target: string;
  /** 关系描述：如「宿敌」「师徒」「暗恋」 */
  relation: string;
}

export interface GenerationContext {
  project_id: string;
  project_title?: string;
  summary?: string;
  plot_summary?: string;
  characters?: GenerationContextCharacter[];
  /** 大纲骨架（文本折叠，供 mock 占位与后端文本兜底） */
  outline?: string;
  /** 大纲结构化树（卷→章→节点），后端 LangGraph 可精确消费，不必反解文本 */
  outlineTree?: GenerationContextOutlineVolume[];
  sections?: { title: string; content: string }[];  // 本章相关自定义维度
  source?: 'character' | 'chapter';
  source_ref?: string;
  brief?: string;
  // 个人库本地向量检索命中的片段，随请求发后端（后端可见、可溯源，但不存不检）
  rag_chunks?: RagChunk[];
}

// 大纲三级树（与 lib/storage/backup 的 OutlineVolume 对齐，前端注入用纯结构）
export interface GenerationContextOutlineNode {
  id: string;
  title: string;
  content?: string;
  status?: 'todo' | 'writing' | 'done';
  charIds?: string[];
  sectionIds?: string[];
}
export interface GenerationContextOutlineChapter {
  id: string;
  title: string;
  nodes: GenerationContextOutlineNode[];
}
export interface GenerationContextOutlineVolume {
  id: string;
  title: string;
  chapters: GenerationContextOutlineChapter[];
}

// 个人文档库检索命中片段（端侧向量检索结果）
export interface RagChunk {
  docId: string;     // 来源文档 id（某本书）
  docName: string;   // 书名 / 文档名
  text: string;      // 检索到的文本片段
  score: number;     // 相似度（越大越相关）
  uploaderName?: string; // 作者
}

// 检索范围限定（三种模式可组合）
// - 不传 filter：自动搜（按节点书写内容语义匹配整库）
// - sample：给样本搜（用户贴文本当 query）
// - docIds / authorIds：限定范围（可多项）
export interface RagFilter {
  docIds?: string[];
  authorIds?: string[];
  sample?: string;
}

export type RagScope = 'personal' | 'public' | 'both';

export interface SyncResponse {
  updates: unknown[];
  version?: number;
}

export type SyncEntityType = 'projects' | 'characters' | 'briefs' | 'models' | 'settings' | 'portfolio';

// Media types
export type MediaKind = 'image' | 'video';

export interface MediaTask {
  id: string;
  prompt: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress?: number;
  result_url?: string;
  kind: MediaKind;
  project_id?: string;
  source?: 'character' | 'chapter';
  source_ref?: string;
  /** 视频专属：关联章节（回链用，3.3） */
  chapter_id?: string;
  /** 视频专属：本次用到的角色 id 列表（来自角色图，3.1） */
  character_ids?: string[];
  /** 视频专属：分镜脚本文本（后端生成或前端拼装，预留） */
  storyboard?: string;
  createdAt: string;
}

// Request types for generation API
export type GenerationBaseRequest = {
  prompt: string;
  negative_prompt?: string;
  model_id?: string;
  project_id?: string;
  context?: GenerationContext;
  source_step?: string;
};

export interface ImageRequest extends GenerationBaseRequest {
  style?: string;
  size?: string;
  count?: number;
  characterId?: string;
  /** 角色一致性：用作参考图的 URL（后端据此保持同一角色多图一致） */
  reference_image?: string;
  /** 角色一致性：固定随机种子（同一 seed 产出更稳定的角色外观） */
  seed?: number;
}

export interface VideoRequest extends GenerationBaseRequest {
  duration?: number;
  aspect?: string;
  /** 视频专属：关联章节（回链，3.3） */
  chapter_id?: string;
  /** 视频专属：本次用到的角色 id 列表（来自角色图，3.1） */
  character_ids?: string[];
  /** 视频专属：角色参考图 URL（保证视频中角色外观一致，3.1） */
  reference_images?: string[];
  /** 视频专属：分镜脚本（后端生成或前端拼装，预留） */
  storyboard?: string;
}

// 数据来源标记：增量合并时用于判断「该单元是否被用户手动改过」。
// - seed：种子生成填入，用户未手动改，可被后续种子覆盖
// - user：用户手动编辑/自建，种子回填时跳过、原地保留
// - init：本地从零创建（未经过种子），等同 user 语义，种子不覆盖
export type Origin = 'seed' | 'user' | 'init';

// 用户自定义的弹性设定维度（势力/战力/阵营关系/地图/时间线…任意维度）。
// 不写死为平铺字段，让作者自由增删，避免每次加维度都改类型。
export interface BriefSection {
  id: string;               // 稳定 id，便于增删改
  title: string;            // 维度名，如「势力设定」「战力体系」「阵营关系」
  content: string;          // 该维度设定文本（生成时可由 summarizer 压缩）
  pinned?: boolean;         // 是否常驻注入生成（核心维度每次都带）
  origin?: Origin;          // 该维度来源（种子/用户），用于增量合并
  updatedAt?: string;
}

// 项目级「创作设定」：统一注入到角色对话与图文/视频生成，
// 控制"与小说内容相关的程度"。由前端编辑，后端未就绪时存 IndexedDB。
export interface ProjectBrief {
  projectId: string;
  genre?: string;            // 类型，如 科幻/武侠
  worldview?: string;        // 世界观设定
  tone?: string;             // 基调/文风，如 轻松幽默/暗黑严肃
  forbidden?: string;        // 创作禁忌（生成与对话都遵守）
  styleGuide?: string;       // 风格指南（视觉/文本统一参考）
  defaultVisionModel?: string; // 项目默认视觉模型 id（子生成沿用）
  defaultStyle?: string;     // 项目默认图片风格
  wordCountGoal?: number;    // 写作目标（总字数）
  dailyWordCountGoal?: number; // 每日目标（字数）
  sections?: BriefSection[]; // 自定义设定维度（用户自由增删）
  // 平铺字段来源标记：key=字段名（genre/worldview/tone/...），value=来源。
  // 用户手动改某字段 → 标 'user'，种子回填时该字段跳过。
  fieldOrigins?: Partial<Record<'genre' | 'worldview' | 'tone' | 'forbidden' | 'styleGuide' | 'defaultVisionModel' | 'defaultStyle' | 'wordCountGoal' | 'dailyWordCountGoal', Origin>>;
  updatedAt?: string;
}

export interface Step {
  id: string;
  agent: string;
  /** 展示名（中文节点名），优先于 agent 英文 nodeId 解析 */
  agentName?: string;
  content: string;
  status: 'pending' | 'streaming' | 'waiting' | 'completed' | 'failed';
  /** 关联的工作流节点 id（由 workflowToSteps 生成，便于"运行写入项目"映射） */
  nodeId?: string;
}

/** 作家手稿章节（独立于工作台 AI steps，可双向互导） */
export interface ManuscriptChapter {
  id: string;
  projectId: string;
  index: number;             // 章节序号，用于排序
  title: string;
  content: string;
  updatedAt: string;
  source?: 'manual' | 'imported' | 'ai' | 'ai_edited';   // 人工撰写 / 从工作台导入 / 纯AI / AI后手工修改
  linkedStepId?: string;     // 若从工作台某 step 导入，记录来源
}

// 角色在故事中的基础定位（预设 + 自定义），用于生成时区分戏份权重。
// 角色间的"关系"用结构化 relationships 表达（见下），可自由增删自定义。
export type CharacterRole =
  | 'protagonist'      // 主角
  | 'heroine'          // 女主
  | 'deuteragonist'    // 男二
  | 'antagonist'       // 反派
  | 'supporting'       // 配角
  | 'custom'           // 自定义
  | (string & {});     // 允许任意自定义字符串

/** 角色关系：指向本项目的另一个角色，并可自定义关系描述（如「青梅竹马、暗恋」）。 */
export interface CharacterRelationship {
  id: string;
  /** 对端角色 id（限制在本项目内，便于生成时解析） */
  targetId: string;
  /** 关系描述：可自由填写，如「宿敌」「师徒」「暗恋」 */
  relation: string;
}

export interface Character {
  id: string;
  name: string;
  avatar?: string;
  description: string;        // 静态人设（初始卡）
  role?: CharacterRole;       // 故事定位：主角/女主/配角/反派…
  status?: string;            // 当前状态：存活/死亡/自定义（string 支持任意）
  currentProfile?: string;    // 当前时间点详情：心理/关系/处境/变化（随剧情演化）
  /** 故事定位的自定义文案：当选中「自定义」时填写，显示用 */
  customRole?: string;
  /** 结构化角色关系：与谁、是什么关系（可自定义）。替代把关系塞进 currentProfile 文本。 */
  relationships?: CharacterRelationship[];
  novelId?: string;
  projectId?: string | null;
  images?: string[];
  /** 角色一致性：锁定用作参考图的 URL（出图时作为 reference_image 透传） */
  referenceImage?: string | null;
  /** 角色一致性：锁定的随机种子（出图时作为 seed 透传） */
  imageSeed?: number | null;
  origin?: Origin;          // 角色来源（种子/用户），增量合并用
  createdAt: string;
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  emoji?: string;
}

// ============ 种子生成（一句话开局 / 中途单补）============
// 后端 seed 子图返回结构化 JSON，前端适配器增量合并回填三个 store。
// 关键约定（照顾后端）：
//  - 所有 id 由【后端生成并返回】，前端回填时信任这些 id（不前端造 uid），
//    以保证跨端稳定、RAG chunk / currentProfile 关联一致。
//  - 字段形状直接对齐 store 类型，等于 schema 白送，前端无需解析文本。

export type SeedPart = 'brief' | 'outline' | 'characters';

// 种子产出的「创作设定」结构（对齐 ProjectBrief 的可合并字段）
export interface SeedBrief {
  genre?: string;
  worldview?: string;
  tone?: string;
  forbidden?: string;
  styleGuide?: string;
  defaultVisionModel?: string;
  defaultStyle?: string;
  wordCountGoal?: number;
  dailyWordCountGoal?: number;
  sections?: { id: string; title: string; content: string; pinned?: boolean }[];
}

// 种子产出的「大纲」结构（对齐 OutlineVolume[]，带 origin 不在此层，由适配器打）
export interface SeedOutline {
  volumes: {
    id: string;
    title: string;
    chapters: {
      id: string;
      title: string;
      nodes: { id: string; title: string; content?: string; targetWords?: number; charIds?: string[]; sectionIds?: string[] }[];
    }[];
  }[];
}

// 种子产出的「角色」结构（对齐 Character，缺 createdAt 由适配器补）
export interface SeedCharacter {
  id: string;
  name: string;
  description: string;
  role?: CharacterRole;
  status?: string;
  currentProfile?: string;
}

// 后端 /api/projects/:id/seed 的完整返回（开局：一次填满三项）
export interface ProjectSeed {
  brief?: SeedBrief;
  outline?: SeedOutline;
  characters?: SeedCharacter[];
}

// 后端契约请求体
//  - generateSeed：开局，prompt 为用户一句话；后端据此生成完整三项。
//  - generatePart：中途单补某一项；context 为「当前项目已有数据」的精简快照，
//    后端据此生成与现有设定自洽的内容（不凭空矛盾）。
export interface SeedRequest {
  prompt?: string;
  part?: SeedPart;
  // 中途单补时携带的上下文（前端把当前 brief/已存在角色/大纲摘要压缩后传入）
  context?: { brief?: SeedBrief; existingCharacterIds?: string[]; outlineSummary?: string };
}