// src/features/user-agent/stores/agentStore.ts
// Agent 状态管理：对话线程、消息、阶段、加载状态等

import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { 
   AgentMessage, 
   AgentPhase, 
   ToolCallLog, 
   Plan, 
   AgentThread, 
   SSEEvent,
   AgentConfig,
   ReviewCard,
   CardProposal,
   NodeOutput
 } from '../types/agent'

interface AgentState {
  // 线程管理
  threads: AgentThread[]
  currentThreadId: string | null
  
  // 消息管理（按 threadId 分组存储优化）
  messages: Record<string, AgentMessage[]> // threadId => messages[]
  
  // 工具调用日志
  toolCalls: Record<string, ToolCallLog[]> // threadId => toolCalls[]
  
  // 计划管理
  plans: Record<string, Plan[]> // threadId => plans[]

  // 子计划（按 parent tool call ID 分组）
  subPlans: Record<string, Plan[]> // parentToolCallId => plans[]
  
  // 当前活跃阶段（用于 UI 展示 ThinkPanel 等）
  currentPhase: string | null
  
  // 加载状态
  isLoading: boolean
  
  // 错误状态
  error: string | null
  
  // Agent 配置（可选）
  config: AgentConfig
  
  // 选中的文本（用于 SelectionToolbar）
  selectedText: string | null

  // 建议（用于 SuggestionBubble）
  suggestions: Array<{
    id: string
    text: string
    action: string
    target?: string
  }>

  // 审核卡片（review_card 事件）
  pendingReview: ReviewCard | null

  // 卡片提案（propose_cards 事件）
  pendingCards: CardProposal | null

  // 节点输出（node_stream 逐 token 追加）
  nodeOutputs: Record<string, NodeOutput>

  // 思考步骤（agent_think 流式追加）
  thinkingSteps: Array<{ token: string }>

  // 当前活跃节点
  activeNode: { nodeId: string; label: string } | null
  
  // Actions
  // 线程管理
  createThread: (title?: string) => string
  setCurrentThread: (threadId: string) => void
  deleteThread: (threadId: string) => void
  updateThreadTitle: (threadId: string, title: string) => void
  
  // 消息管理
  addMessage: (message: AgentMessage) => void
  updateMessage: (messageId: string, partial: Partial<AgentMessage>) => void
  removeMessage: (messageId: string) => void
  clearMessages: (threadId: string) => void
  
  // 工具调用管理
  addToolCall: (toolCall: ToolCallLog) => void
  updateToolCall: (toolCallId: string, partial: Partial<ToolCallLog>) => void
  
  // 计划管理
  addPlan: (plan: Plan) => void
  updatePlan: (planId: string, partial: Partial<Plan>) => void
  
  // 阶段管理
  setPhase: (phase: string | null) => void
  
  // 加载状态
  setLoading: (isLoading: boolean) => void
  
  // 错误状态
  setError: (error: string | null) => void
  
  // 选中文本管理
  setSelectedText: (text: string | null) => void
  
  // 子计划管理
  addSubPlan: (parentToolCallId: string, plan: Plan) => void
  
  // 建议管理
  setSuggestions: (suggestions: Array<{ id: string; text: string; action: string; target?: string }>) => void

  // 审核卡片管理
  setPendingReview: (review: ReviewCard | null) => void

  // 卡片提案管理
  setPendingCards: (cards: CardProposal | null) => void

  // 节点输出管理
  setNodeOutput: (nodeId: string, output: NodeOutput) => void
  clearNodeOutputs: () => void

  // 思考步骤管理
  appendThinkingStep: (token: string) => void
  clearThinkingSteps: () => void

  // 活跃节点管理
  setActiveNode: (node: { nodeId: string; label: string } | null) => void
  
  // SSE 事件处理
  handleSSEEvent: (event: SSEEvent) => void
  
  // 重置状态（用于切换线程时清理临时状态）
  reset: (keepThreads?: boolean) => void
}

const DEFAULT_CONFIG: AgentConfig = {
  modelId: 'default', // 实际应从用户设置中获取
  temperature: 0.7,
  maxTokens: 2000,
  stream: true
}

const createTitle = (title?: string) => {
  return title || `对话 ${new Date().toLocaleTimeString()}`
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set, get) => ({
      // 初始状态
      threads: [],
      currentThreadId: null,
      messages: {},
      toolCalls: {},
      plans: {},
      subPlans: {},
      currentPhase: null,
      isLoading: false,
      error: null,
      config: DEFAULT_CONFIG,
       selectedText: null,
       suggestions: [],
       pendingReview: null,
       pendingCards: null,
       nodeOutputs: {},
       thinkingSteps: [],
       activeNode: null,
      
      // 线程管理
      createThread: (title?: string) => {
        const threadId = `thread_${Date.now()}_${crypto.randomUUID()}`
        const newThread: AgentThread = {
          id: threadId,
          title: createTitle(title),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          messageCount: 0,
          isLoading: false
        }
        
        set(state => ({
          threads: [...state.threads, newThread],
          currentThreadId: threadId,
          messages: {
            ...state.messages,
            [threadId]: []
          },
          toolCalls: {
            ...state.toolCalls,
            [threadId]: []
          },
          plans: {
            ...state.plans,
            [threadId]: []
          }
        }))
        
        return threadId
      },
      
      setCurrentThread: (threadId: string) => {
        // 切换线程时清理临时状态（如 selectedText）
        set({ 
          currentThreadId: threadId,
          selectedText: null,
          currentPhase: null
        })
      },
      
      deleteThread: (threadId: string) => {
        set(state => {
          const newThreads = state.threads.filter(t => t.id !== threadId)
          const newMessages = { ...state.messages }
          const newToolCalls = { ...state.toolCalls }
          const newPlans = { ...state.plans }
          
          delete newMessages[threadId]
          delete newToolCalls[threadId]
          delete newPlans[threadId]
          
          // 如果删除的是当前线程，切换到第一个可用线程或 null
          const newCurrentThreadId = 
            state.currentThreadId === threadId 
              ? (newThreads.length > 0 ? newThreads[0].id : null) 
              : state.currentThreadId
          
          return {
            threads: newThreads,
            currentThreadId: newCurrentThreadId,
            messages: newMessages,
            toolCalls: newToolCalls,
            plans: newPlans,
            selectedText: null,
            currentPhase: null
          }
        })
      },
      
      updateThreadTitle: (threadId: string, title: string) => {
        set(state => {
          const updatedThreads = state.threads.map(t =>
            t.id === threadId 
              ? { ...t, title, updatedAt: new Date().toISOString() }
              : t
          )
          
          return { threads: updatedThreads }
        })
      },
      
      // 消息管理
      addMessage: (message: AgentMessage) => {
        set(state => {
          const threadMessages = state.messages[message.threadId] || []
          const updatedMessages = [...threadMessages, message]
          
          // 更新线程的消息计数和最后消息时间
          const updatedThreads = state.threads.map(t =>
            t.id === message.threadId
              ? {
                  ...t,
                  messageCount: updatedMessages.length,
                  lastMessageAt: message.createdAt
                }
              : t
          )
          
          return {
            threads: updatedThreads,
            messages: {
              ...state.messages,
              [message.threadId]: updatedMessages
            }
          }
        })
      },
      
      updateMessage: (messageId: string, partial: Partial<AgentMessage>) => {
        set(state => {
          // 需要遍历所有线程来找到消息（效率较低，但消息数量通常不大）
          const newMessages = { ...state.messages }
          let updated = false
          
          for (const threadId in state.messages) {
            const msgIndex = state.messages[threadId].findIndex(m => m.id === messageId)
            if (msgIndex >= 0) {
              const updatedMessages = [...state.messages[threadId]]
              updatedMessages[msgIndex] = { ...updatedMessages[msgIndex], ...partial }
              newMessages[threadId] = updatedMessages
              updated = true
              break
            }
          }
          
          if (!updated) {
            console.warn(`Message ${messageId} not found for update`)
            return state
          }
          
          return { messages: newMessages }
        })
      },
      
      removeMessage: (messageId: string) => {
        set(state => {
          const newMessages = { ...state.messages }
          let removedFromThread: string | null = null
          
          for (const threadId in state.messages) {
            const msgIndex = state.messages[threadId].findIndex(m => m.id === messageId)
            if (msgIndex >= 0) {
              newMessages[threadId] = state.messages[threadId].filter(m => m.id !== messageId)
              removedFromThread = threadId
              break
            }
          }
          
          if (removedFromThread) {
            // 更新线程消息计数
            const updatedThreads = state.threads.map(t =>
              t.id === removedFromThread
                ? {
                    ...t,
                    messageCount: state.messages[removedFromThread].length - 1,
                    lastMessageAt: 
                        state.messages[removedFromThread].length > 1 
                          ? state.messages[removedFromThread][state.messages[removedFromThread].length - 2].createdAt
                          : undefined
                  }
                : t
            )
            
            return {
              threads: updatedThreads,
              messages: newMessages
            }
          }
          
          return state
        })
      },
      
      clearMessages: (threadId: string) => {
        set(state => {
          const newMessages = { ...state.messages }
          if (newMessages[threadId]) {
            newMessages[threadId] = []
            
            // 更新线程消息计数
            const updatedThreads = state.threads.map(t =>
              t.id === threadId
                ? { ...t, messageCount: 0, lastMessageAt: undefined }
                : t
            )
            
            return { threads: updatedThreads, messages: newMessages }
          }
          
          return state
        })
      },
      
      // 工具调用管理
      addToolCall: (toolCall: ToolCallLog) => {
        set(state => {
          const threadCalls = state.toolCalls[toolCall.threadId] || []
          const updatedCalls = [...threadCalls, toolCall]
          
          return {
            toolCalls: {
              ...state.toolCalls,
              [toolCall.threadId]: updatedCalls
            }
          }
        })
      },
      
      updateToolCall: (toolCallId: string, partial: Partial<ToolCallLog>) => {
        set(state => {
          // 遍历所有线程的工具调用
          const newToolCalls = { ...state.toolCalls }
          let updated = false
          
          for (const threadId in state.toolCalls) {
            const callIndex = state.toolCalls[threadId].findIndex(tc => tc.id === toolCallId)
            if (callIndex >= 0) {
              const updatedCalls = [...state.toolCalls[threadId]]
              updatedCalls[callIndex] = { ...updatedCalls[callIndex], ...partial }
              newToolCalls[threadId] = updatedCalls
              updated = true
              break
            }
          }
          
          if (!updated) {
            console.warn(`Tool call ${toolCallId} not found for update`)
            return state
          }
          
          return { toolCalls: newToolCalls }
        })
      },
      
      // 计划管理
      addPlan: (plan: Plan) => {
        set(state => {
          const threadPlans = state.plans[plan.threadId] || []
          const updatedPlans = [...threadPlans, plan]
          
          return {
            plans: {
              ...state.plans,
              [plan.threadId]: updatedPlans
            }
          }
        })
      },
      
      updatePlan: (planId: string, partial: Partial<Plan>) => {
        set(state => {
          // 遍历所有线程的计划
          const newPlans = { ...state.plans }
          let updated = false
          
          for (const threadId in state.plans) {
            const planIndex = state.plans[threadId].findIndex(p => p.id === planId)
            if (planIndex >= 0) {
              const updatedPlans = [...state.plans[threadId]]
              updatedPlans[planIndex] = { ...updatedPlans[planIndex], ...partial }
              newPlans[threadId] = updatedPlans
              updated = true
              break
            }
          }
          
          if (!updated) {
            console.warn(`Plan ${planId} not found for update`)
            return state
          }
          
          return { plans: newPlans }
        })
      },
      
      // 阶段管理
      setPhase: (phase: string | null) => {
        set({ currentPhase: phase })
      },
      
      // 加载状态
      setLoading: (isLoading: boolean) => {
        set({ isLoading })
      },
      
      // 错误状态
      setError: (error: string | null) => {
        set({ error })
      },
      
      // 选中文本管理
      setSelectedText: (text: string | null) => {
        set({ selectedText: text })
      },
      
// 子计划管理
      addSubPlan: (parentToolCallId: string, plan: Plan) => {
        set(state => {
          const existing = state.subPlans[parentToolCallId] || []
          return {
            subPlans: {
              ...state.subPlans,
              [parentToolCallId]: [...existing, plan]
            }
          }
        })
      },
      
      // 建议管理
      setSuggestions: (suggestions) => {
        set({ suggestions })
      },

      setPendingReview: (review) => {
        set({ pendingReview: review })
      },

      setPendingCards: (cards) => {
        set({ pendingCards: cards })
      },

      setNodeOutput: (nodeId, output) => {
        set(state => ({
          nodeOutputs: { ...state.nodeOutputs, [nodeId]: output }
        }))
      },

      clearNodeOutputs: () => {
        set({ nodeOutputs: {} })
      },

      appendThinkingStep: (token) => {
        set(state => ({
          thinkingSteps: [...state.thinkingSteps, { token }]
        }))
      },

      clearThinkingSteps: () => {
        set({ thinkingSteps: [] })
      },

      setActiveNode: (node) => {
        set({ activeNode: node })
      },
      
      // SSE 事件处理
      handleSSEEvent: (event: SSEEvent) => {
        const state = get()
        // 根据事件类型更新状态
        switch (event.type) {
          case 'token':
            // 追加 token 到最后一条 assistant 消息
            if (state.currentThreadId) {
              const threadMessages = state.messages[state.currentThreadId] || []
              if (threadMessages.length > 0) {
                const lastMsg = threadMessages[threadMessages.length - 1]
                if (lastMsg.role === 'assistant') {
                  get().updateMessage(lastMsg.id, {
                    content: lastMsg.content + (event.data as string)
                  })
                }
              }
            }
            break
            
          case 'tool_start':
            // 新增工具调用日志
            if (event.data && typeof event.data === 'object') {
              const toolData = event.data as {
                toolName: string
                parameters: Record<string, any>
                parentId?: string
              }
              
              const toolCall: ToolCallLog = {
                id: `tool_${Date.now()}_${crypto.randomUUID()}`,
                threadId: state.currentThreadId || '',
                toolName: toolData.toolName,
                parameters: toolData.parameters,
                startedAt: new Date().toISOString(),
                parentId: toolData.parentId
              }
              
              get().addToolCall(toolCall)
            }
            break
            
          case 'tool_end':
            // 更新工具调用状态
            if (event.data && typeof event.data === 'object' && event.data.toolCallId) {
              const toolData = event.data as {
                toolCallId: string
                result?: string
                error?: string
              }
              
              get().updateToolCall(toolData.toolCallId, {
                endedAt: new Date().toISOString(),
                result: toolData.result,
                error: toolData.error
              })
            }
            break
            
          case 'plan_ready':
            // 新增或更新计划
            if (event.data && typeof event.data === 'object') {
              const planData = event.data as {
                id?: string
                version?: number
                parentId?: string
                steps: Array<{
                  id: string
                  description: string
                  requiredApproval: boolean
                }>
                entities?: Array<{
                  type: 'character' | 'location' | 'item' | 'event'
                  id: string
                  name: string
                }>
                constraints?: string
              }
              
              const plan: Plan = {
                id: planData.id || `plan_${Date.now()}_${crypto.randomUUID()}`,
                threadId: state.currentThreadId || '',
                version: planData.version || 1,
                steps: planData.steps.map(step => ({
                  id: step.id || `step_${Date.now()}_${crypto.randomUUID()}`,
                  description: step.description,
                  status: 'pending',
                  referencedEntities: (planData.entities || []).map(entity => ({
                    type: entity.type,
                    id: entity.id,
                    name: entity.name
                  })),
                  requiresApproval: step.requiredApproval ?? false,
                  approved: false
                })),
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                status: 'draft'
              }
              
              if (planData.parentId) {
                // 嵌套计划：关联到父工具调用
                get().addSubPlan(planData.parentId, plan)
              } else {
                get().addPlan(plan)
              }
            }
            break
            
          case 'progress':
            // 更新当前阶段的进度信息
            if (event.data && typeof event.data === 'object') {
              const progressData = event.data as {
                stepIndex?: number
                completedChars?: number
                totalChars?: number
                estimatedRemainingSeconds?: number
                parentId?: string
              }
              
              if (progressData.parentId && state.currentThreadId) {
                // 嵌套进度：更新父工具调用的进度
                const threadToolCalls = state.toolCalls[state.currentThreadId] || []
                const parentCall = threadToolCalls.find(tc => tc.id === progressData.parentId)
                if (parentCall) {
                  get().updateToolCall(progressData.parentId, {
                    result: `进度: ${progressData.completedChars ?? 0}/${progressData.totalChars ?? 0} 字`
                  })
                }
              }
            }
            break
            
          case 'suggestions':
            // 存储建议以在 SuggestionBubble 中显示
            if (event.data && typeof event.data === 'object') {
              const suggestionsData = event.data as Array<{
                id?: string
                text: string
                action: string
                target?: string
              }>
              get().setSuggestions(suggestionsData.map((s, i) => ({
                id: s.id || `suggestion_${Date.now()}_${i}`,
                text: s.text,
                action: s.action,
                target: s.target
              })))
            }
            break
            
           case 'agent_think':
            if (event.data && typeof event.data === 'object' && event.data.token) {
              get().appendThinkingStep(event.data.token)
            }
            break

          case 'agent_think_end':
            break

          case 'node_start':
            if (event.data && typeof event.data === 'object') {
              const { node_id, label } = event.data as { node_id: string; label: string }
              get().setActiveNode({ nodeId: node_id, label })
              get().setNodeOutput(node_id, {
                nodeId: node_id,
                label,
                chunks: [],
                completed: false
              })
            }
            break

          case 'node_stream':
            if (event.data && typeof event.data === 'object') {
              const { node_id, token, index } = event.data as { node_id: string; token: string; index: number }
              const current = get().nodeOutputs[node_id]
              if (current) {
                const updated = { ...current, chunks: [...current.chunks, { index, token }] }
                get().setNodeOutput(node_id, updated)
              }
            }
            break

          case 'node_end':
            if (event.data && typeof event.data === 'object') {
              const { node_id, output_preview } = event.data as { node_id: string; output_preview?: string }
              const current = get().nodeOutputs[node_id]
              if (current) {
                get().setNodeOutput(node_id, {
                  ...current,
                  completed: true,
                  outputPreview: output_preview
                })
              }
            }
            break

          case 'propose_cards':
            if (event.data && typeof event.data === 'object') {
              const cardData = event.data as {
                card_types: string[]
                reason: string
                cards: Array<{ id: string; type: string; title: string; summary: string }>
              }
              get().setPendingCards({
                threadId: state.currentThreadId || '',
                cardTypes: cardData.card_types,
                reason: cardData.reason,
                cards: cardData.cards
              })
            }
            break

          case 'review_card':
            if (event.data && typeof event.data === 'object') {
              const reviewData = event.data as ReviewCard & Record<string, unknown>
              get().setPendingReview({
                threadId: state.currentThreadId || '',
                severity: reviewData.severity || 'medium',
                nodeLabel: reviewData.nodeLabel || '',
                issues: reviewData.issues || [],
                overallAssessment: reviewData.overallAssessment || '',
                outputPreview: reviewData.outputPreview || ''
              })
            }
            break

          case 'review_resolved':
            get().setPendingReview(null)
            break

          case 'lock_violation':
            if (event.data && typeof event.data === 'object') {
              const lockData = event.data as { entity_type?: string; entity_id?: string }
              const label = {
                book: '书籍',
                chapter: '章节',
                character: '角色'
              }[lockData.entity_type || ''] || lockData.entity_type || '实体'
              console.warn(`[Lock] ${label} ${lockData.entity_id || ''} 已被锁定`)
            }
            break

          case 'compress_done':
            break

          case 'end':
            // 对话结束，重置加载状态
            get().setLoading(false)
            break
            
          default:
            // 未知事件类型，忽略
            break
        }
      },
      
      // 重置状态
      reset: (keepThreads = false) => {
        if (keepThreads) {
          set({
            messages: {},
            toolCalls: {},
            plans: {},
            subPlans: {},
            currentPhase: null,
            isLoading: false,
            error: null,
            selectedText: null,
            suggestions: [],
            pendingReview: null,
            pendingCards: null,
            nodeOutputs: {},
            thinkingSteps: [],
            activeNode: null
          })
        } else {
          set({
            threads: [],
            currentThreadId: null,
            messages: {},
            toolCalls: {},
            plans: {},
            subPlans: {},
            currentPhase: null,
            isLoading: false,
            error: null,
            config: DEFAULT_CONFIG,
            selectedText: null,
            suggestions: [],
            pendingReview: null,
            pendingCards: null,
            nodeOutputs: {},
            thinkingSteps: [],
            activeNode: null
          })
        }
      }
    }),
    {
      name: 'agent-storage', // localStorage key
      partialize: (state) => ({ 
        // 只持久化线程列表和当前线程ID，其他状态为临时状态
        threads: state.threads,
        currentThreadId: state.currentThreadId
      })
    }
  )
)