// src/features/user-agent/api/agentApi.ts
// Agent API 服务：封装与后端的交互，包括 SSE 流处理

import apiClient from '@/shared/lib/apiClient'
import { 
   AgentMessage, 
   AgentPhase, 
   ToolCallLog, 
   Plan, 
   SSEEvent,
   AgentResponse,
   TextOperationType,
   AgentConfig
 } from '../types/agent'

const AGENT_API_BASE = '/api/agent'

export const startSession = async (
  threadId: string | null,
  initialMessage: string,
  config?: Partial<AgentConfig>
): Promise<AgentResponse> => {
  try {
    const payload = {
      thread_id: threadId,
      message: initialMessage,
      config: config || {}
    }
    
    const { data } = await apiClient.post<AgentResponse>(`${AGENT_API_BASE}/start`, payload)
    return data
  } catch (error) {
    console.error('Failed to start agent session:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 向现有会话发送消息（非流式）
 * @param threadId 线程 ID
 * @param message 用户消息
 * @returns Promise 包含完整响应
 */
export const respondAgent = async (
  threadId: string,
  message: string
): Promise<AgentResponse> => {
  try {
    const { data } = await apiClient.post<AgentResponse>(`${AGENT_API_BASE}/respond`, {
      thread_id: threadId,
      message
    })
    return data
  } catch (error) {
    console.error('Failed to respond to agent:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 获取 Agent 响应的事件流（SSE），POST 方式
 * 后端 data: {json} 格式，type 字段在 JSON body 中
 */
export const streamAgent = async (
   threadId: string,
   message: string,
   modelConfigData?: Record<string, unknown>
 ): Promise<AsyncIterable<SSEEvent>> => {
   try {
     const response = await fetch(
       `${AGENT_API_BASE}/stream/${threadId}`,
       {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json',
           'Accept': 'text/event-stream',
           'Cache-Control': 'no-cache'
         },
         body: JSON.stringify({
           thread_id: threadId,
           message,
           modelConfig: modelConfigData ?? {}
         })
       }
     )
     
     if (!response.ok) {
       throw new Error(`HTTP error! status: ${response.status}`)
     }
     
     return {
       [Symbol.asyncIterator](): AsyncIterator<SSEEvent> {
         const reader = response.body?.getReader()
         if (!reader) {
           throw new Error('Response body is not readable')
         }
         
         const decoder = new TextDecoder('utf-8')
         let buffer = ''
         let currentEventType = 'message'
         
         return {
           async next() {
             try {
               while (true) {
                 const chunk = await reader.read()
                 if (chunk.done) {
                   return { value: { type: 'end', data: null }, done: true }
                 }
                 
                 buffer += decoder.decode(chunk.value, { stream: true })
                 
                 const lines = buffer.split('\n')
                 buffer = lines.pop() || ''
                 
                 for (const line of lines) {
                   if (line.startsWith('event:')) {
                     currentEventType = line.substring(6).trim()
                   } else if (line.startsWith('data:')) {
                     const data = line.substring(5).trim()
                     if (data === '[DONE]') {
                       return { value: { type: 'end', data: null }, done: true }
                     }
                     
                     try {
                       const parsedData = JSON.parse(data)
                       const eventType = (parsedData.type || currentEventType) as SSEEvent['type']
                       return { 
                         value: { 
                           type: eventType,
                           data: parsedData 
                         }, 
                         done: false 
                       }
                     } catch (e) {
                       return { 
                         value: { 
                           type: currentEventType as SSEEvent['type'],
                           data: data 
                         }, 
                         done: false 
                       }
                     }
                   }
                 }
               }
             } catch (readError) {
               console.error('Error reading SSE stream:', readError)
               return { value: { type: 'end', data: null }, done: true }
             }
           }
         }
       }
     }
   } catch (error) {
     console.error('Failed to create SSE stream:', error)
     return {
       [Symbol.asyncIterator](): AsyncIterator<SSEEvent> {
         return {
           async next() {
             return { value: { type: 'end', data: null }, done: true }
           }
         }
       }
     }
   }
 }

/**
 * Resume agent stream after review action
 */
export const resumeAgentStream = async (
  threadId: string,
  modelConfigData?: Record<string, unknown>
): Promise<AsyncIterable<SSEEvent>> => {
  return streamAgent(threadId, '', modelConfigData)
}

/**
 * Submit review action (retry / accept / edit)
 */
export const reviewAction = async (
  threadId: string,
  action: 'retry' | 'accept' | 'edit',
  editedContent?: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    await apiClient.post(`${AGENT_API_BASE}/review-action`, {
      thread_id: threadId,
      action,
      edited_content: editedContent ?? null
    })
    return { success: true }
  } catch (error) {
    console.error('Failed to submit review action:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 执行文本操作（润色、扩展等）
 * @param text 要操作的文本
 * @param operationType 操作类型
 * @returns Promise 包含操作结果
 */
export const executeTextOperation = async (
  text: string,
  operationType: TextOperationType
): Promise<{ success: boolean; result?: string; error?: string }> => {
  try {
    const { data } = await apiClient.post<{ success: boolean; result?: string; error?: string }>(
      `${AGENT_API_BASE}/text-operation`,
      {
        text,
        operation_type: operationType
      }
    )
    return data
  } catch (error) {
    console.error(`Failed to execute text operation ${operationType}:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 获取会话列表
 * @returns Promise 包含线程列表
 */
export const listThreads = async (): Promise<{ success: boolean; threads?: Array<{ id: string; title: string; createdAt: string; messageCount: number }>; error?: string }> => {
  try {
    const { data } = await apiClient.get<{ success: boolean; threads?: any[] }>(`${AGENT_API_BASE}/threads`)
    return {
      success: data.success,
      threads: data.threads?.map(t => ({
        id: t.id,
        title: t.title || `对话 ${new Date(t.createdAt).toLocaleTimeString()}`,
        createdAt: t.createdAt,
        messageCount: t.message_count || 0
      })) || []
    }
  } catch (error) {
    console.error('Failed to list agent threads:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 获取特定会话的消息历史
 * @param threadId 线程 ID
 * @returns Promise 包含消息列表
 */
export const getThreadMessages = async (
  threadId: string
): Promise<{ success: boolean; messages?: AgentMessage[]; error?: string }> => {
  try {
    const { data } = await apiClient.get<{ success: boolean; messages: any[]; error?: string }>(
      `${AGENT_API_BASE}/threads/${threadId}/messages`
    )
    
    if (!data.success) {
      return { success: false, error: data.error }
    }
    
    // 将后端返回的消息格式转换为前端格式
    const messages: AgentMessage[] = data.messages.map((msg: any) => ({
      id: msg.id,
      threadId: msg.thread_id,
      role: msg.role,
      content: msg.content,
      createdAt: msg.created_at,
      toolName: msg.tool_name,
      toolCallId: msg.tool_call_id,
      parentId: msg.parent_id,
      status: msg.status,
      metadata: msg.metadata
    }))
    
    return { success: true, messages }
  } catch (error) {
    console.error(`Failed to get messages for thread ${threadId}:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

/**
 * 删除会话
 * @param threadId 线程 ID
 * @returns Promise 表示操作结果
 */
export const deleteThread = async (
  threadId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    await apiClient.delete(`${AGENT_API_BASE}/threads/${threadId}`)
    return { success: true }
  } catch (error) {
    console.error(`Failed to delete thread ${threadId}:`, error)
    return {
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }
  }
}

// 导出所有 API 函数
export const agentApi = {
  startSession,
  respondAgent,
  streamAgent,
  resumeAgentStream,
  reviewAction,
  executeTextOperation,
  listThreads,
  getThreadMessages,
  deleteThread
}

export default agentApi