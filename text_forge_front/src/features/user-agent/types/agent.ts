// src/features/user-agent/types/agent.ts
// Agent 相关 TS 类型：AgentMessage、AgentPhase、ToolCallLog、Plan、SSEEvent 等

export interface AgentMessage {
   id: string
   threadId: string
   role: 'user' | 'assistant' | 'tool' | 'system'
   content: string
   createdAt: string
   // 可选字段，仅在特定 role 下存在
   toolName?: string // 当 role === 'tool' 时，表示调用的工具名称
   toolCallId?: string // 当 role === 'tool' 时，对应的 tool_call ID
   parentId?: string // 用于工具调用的父消息 ID（如 tool_call 的 ID）
   status?: 'pending' | 'completed' | 'error' // 工具执行状态
   result?: string // 当 role === 'tool' 且 status === 'completed' 时，表示工具返回结果
   error?: string // 当 role === 'tool' 且 status === 'error' 时，表示错误信息
   metadata?: Record<string, any> // 扩展字段，如 token usage、模型名称等
 }
 
 export interface EntityProposal {
   id: string
   type: 'character' | 'location' | 'item' | 'event'
   name: string
   reason: string
   confirmed: boolean
 }

export interface AgentPhase {
  id: string
  threadId: string
  name: 'think' | 'plan' | 'act' | 'reflect' | 'done'
  startedAt: string
  endedAt?: string
  // 可选：当前阶段的进度信息
  progress?: number // 0-100
  currentStep?: string
  totalSteps?: number
}

export interface ToolCallLog {
  id: string
  threadId: string
  toolName: string
  parameters: Record<string, any>
  result?: string
  error?: string
  startedAt: string
  endedAt?: string
  parentId?: string // 若为嵌套工具调用，指向父 tool_call
}

export interface Plan {
  id: string
  threadId: string
  version: number
  steps: PlanStep[]
  createdAt: string
  updatedAt: string
  // 审批状态
  status: 'draft' | 'pending_review' | 'approved' | 'rejected'
  // 反馈信息
  feedback?: string
  requestedChanges?: string
}

export interface PlanStep {
  id: string
  description: string
  // 执行状态
  status: 'pending' | 'in_progress' | 'completed' | 'failed'
  // 结果
  result?: string
  error?: string
  // 引用的实体（如角色、地点等）
  referencedEntities: {
    type: 'character' | 'location' | 'item' | 'event'
    id: string
    name: string
  }[]
  // 执行时长估计（秒）
  estimatedDuration?: number
  actualDuration?: number
  // 是否需要用户确认
  requiresApproval: boolean
  // 是否已获得用户批准
  approved: boolean
}

export type SSEEventType =
  | 'token'
  | 'tool_start'
  | 'tool_end'
  | 'plan_ready'
  | 'progress'
  | 'suggestions'
  | 'end'
  | 'error'
  | 'agent_think'
  | 'agent_think_end'
  | 'node_start'
  | 'node_stream'
  | 'node_end'
  | 'propose_cards'
  | 'review_card'
  | 'compress_done'
  | 'review_resolved'
  | 'lock_violation'

export interface SSEEvent {
  type: SSEEventType
  data: any
  threadId?: string
  parentId?: string
  sequence?: number
}

export interface ReviewCard {
  threadId: string
  severity: 'critical' | 'medium' | 'minor'
  nodeLabel: string
  issues: Array<{
    id: string
    severity: 'critical' | 'medium' | 'minor'
    title: string
    description: string
    suggestion: string
  }>
  overallAssessment: string
  outputPreview: string
}

export interface CardProposal {
  threadId: string
  cardTypes: string[]
  reason: string
  cards: Array<{
    id: string
    type: string
    title: string
    summary: string
  }>
}

export interface NodeOutput {
  nodeId: string
  label: string
  chunks: Array<{ index: number; token: string }>
  completed: boolean
  outputPreview?: string
}

// 工作流执行时的工具类型（与后端保持一致）
export type ToolType = 
  | 'knowledge_search' 
  | 'web_search' 
  | 'document_reader'
  | 'character_creator'
  | 'plot_generator'
  | 'text_improver'
// 根据实际后端接口扩展

// 文本操作类型（用于 SelectionToolbar）
export type TextOperationType =
  | 'polish_text'
  | 'expand_text'
  | 'rewrite_paragraph'
  | 'check_consistency'
// 根据实际后端接口扩展

// Agent 配置（简化版，实际可能更复杂）
export interface AgentConfig {
  modelId: string
  temperature?: number
  maxTokens?: number
  stream: boolean
}

// Agent 会话状态
export interface AgentThread {
  id: string
  title: string
  createdAt: string
  updatedAt: string
  messageCount: number
  lastMessageAt?: string
  // 当前活跃的阶段
  currentPhase?: AgentPhase
  // 是否正在处理请求
  isLoading: boolean
  // 错误状态
  error?: string
}

// Agent 响应包装
export interface AgentResponse {
  success: boolean
  data?: any
  error?: string
  // 用于 SSE 连接的事件流
  eventStream?: AsyncIterable<SSEEvent>
}