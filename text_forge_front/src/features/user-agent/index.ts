// src/features/user-agent/index.ts
// user-agent feature 公开 API。
// 其它切片/页面只应从 '@/features/user-agent' 消费，禁止深路径直连内部文件。

// ---- UI 组件 (M1: MVP) ----
export { AgentSidebar } from './ui/AgentSidebar'
export { MessageBubble } from './ui/MessageBubble'
export { ThreadList } from './ui/ThreadList'
export { InputBar } from './ui/InputBar'
export { ThinkingPanel } from './ui/ThinkingPanel'
export { SidebarHandle } from './ui/SidebarHandle'
export { PlanCard } from './ui/PlanCard'
export { ToolCallCard } from './ui/ToolCallCard'
export { SelectionToolbar } from './ui/SelectionToolbar'

// ---- UI 组件 (M2-M3: 待实现) ----
// export { PlanCard } from './ui/PlanCard'
// export { QuestionCard } from './ui/QuestionCard'
// export { ReflectCard } from './ui/ReflectCard'
// export { SuggestionBubble } from './ui/SuggestionBubble'
// export { SelectionToolbar } from './ui/SelectionToolbar'
// export { ToolCallCard } from './ui/ToolCallCard'
// export { ProgressBar } from './ui/ProgressBar'

// ---- API ----
export {
  startSession,
  respondAgent,
  streamAgent,
  executeTextOperation,
  listThreads,
  getThreadMessages,
  deleteThread
} from './api/agentApi'
export type {
   AgentMessage,
   AgentPhase,
   ToolCallLog,
   Plan,
   AgentThread,
   SSEEvent,
   AgentConfig,
   TextOperationType
 } from './types/agent'

// ---- Stores ----
export { useAgentStore } from './stores/agentStore'

// ---- Types ----
export * from './types/agent'