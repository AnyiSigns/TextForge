# TextForge API 接口文档

## 基础信息
- Base URL: `/api`
- 认证: Bearer JWT (Access Token)
- 请求格式: `application/json`
- 响应格式: `application/json`
- SSE 响应格式: `text/event-stream`

## 通用约定
- 分页: 无分页，返回全量列表
- 错误码: 401 未授权, 404 不存在, 422 参数错误, 500 服务器错误
- 时间格式: ISO 8601 (`2026-07-25T10:00:00.000Z`)

---

## 1. 认证模块 `/auth`

### 1.1 注册
```
POST /auth/register
Body: { email, password, nickname? }
Response: { access_token, refresh_token, token_type }
```

### 1.2 登录
```
POST /auth/login
Body: { email, password }
Response: { access_token, refresh_token, token_type }
```

### 1.3 刷新 Token
```
POST /auth/refresh
Body: { refresh_token }
Response: { access_token }
```

### 1.4 登出
```
POST /auth/logout
Body: { refresh_token }
Response: { ok: true }
```

### 1.5 发送验证码
```
POST /auth/send-verify-code
Body: { email }
Response: { ok: true }
```

### 1.6 验证邮箱
```
POST /auth/verify-email
Body: { email, code }
Response: { ok: true }
```

---

## 2. 用户模块 `/user`

### 2.1 获取个人信息
```
GET /user/profile
Response: UserResponse
```

### 2.2 更新个人信息
```
PUT /user/profile
Body: { nickname?, avatar? }
Response: UserResponse
```

### 2.3 修改密码
```
PUT /user/change-pwd
Body: { old_password, new_password }
Response: { ok: true }
```

### 2.4 通过邮箱修改密码
```
PUT /user/change-pwd-by-email
Body: { email, code, new_password }
Response: { ok: true }
```

### 2.5 上传头像
```
POST /user/avatar
Content-Type: multipart/form-data
Body: file
Response: { avatar_url }
```

### 2.6 获取头像
```
GET /user/avatar
Response: 图片二进制
```

---

## 3. 项目模块 `/projects`

### 3.1 获取项目列表
```
GET /projects?status=draft&genre=?
Response: { projects: Project[] }
```

### 3.2 创建项目
```
POST /projects
Body: { title, description?, genre? }
Response: { project, version }
```

### 3.3 获取项目详情
```
GET /projects/{id}
Response: { project, steps, characters }
```

### 3.4 更新项目
```
PUT /projects/{id}
Body: { workflow_id?, title?, description?, genre? }
Response: { project, version }
```

### 3.5 删除项目
```
DELETE /projects/{id}
Response: { ok: true }
```

### 3.6 获取项目角色
```
GET /projects/{id}/characters
Response: { characters: Character[] }
```

### 3.7 保存正文步骤
```
PUT /projects/{id}/steps/{stepId}
Body: { content }
Response: { step }
```

### 3.8 确认步骤
```
POST /projects/{id}/confirm
Body: { step_id }
Response: { ok: true }
```

### 3.9 保存项目设定
```
PUT /projects/{id}/brief
Body: BriefRequest
Response: { ok: true }
```

### 3.10 运行项目生成（SSE）
```
POST /projects/{id}/generate
Body: { workflow_id?, thread_id? }
Response: text/event-stream

事件流:
event:node_start
data:{"node":"manager"}

event:node_start
data:{"node":"call_main"}

event:node_end
data:{"node":"call_main"}

event:done
data:{"steps":[...]}
```

---

## 4. 工作流模块 `/workflows`

### 4.1 获取工作流列表
```
GET /workflows
Response: { workflows: Workflow[] }
```

### 4.2 获取工作流详情
```
GET /workflows/{id}
Response: { workflow: Workflow }
```

### 4.3 保存工作流
```
PUT /workflows/{id}
Body: Workflow
Response: { workflow: Workflow }
```

### 4.4 删除工作流
```
DELETE /workflows/{id}
Response: { ok: true }
```

### 4.5 运行工作流（SSE）
```
POST /workflows/{id}/run
Body: { project_id, thread_id }
Response: text/event-stream

事件流:
event:node_start
data:{"node":"manager"}

event:node_start
data:{"node":"call_main"}

event:node_end
data:{"node":"call_main"}

event:done
data:{"steps":[...]}
```

---

## 5. 模型配置模块 `/user/models`

### 5.1 保存模型配置
```
POST /user/models/config
Body: ModelRequest
Response: { ok: 200 }
```

### 5.2 获取模型配置
```
GET /user/models/config
Response: ModelResponse
```

### 5.3 同步模型更新
```
GET /api/sync?since={timestamp}&store=models
Response: { updates: [], version: number }
```

---

## 6. 模型定义

### Workflow
```typescript
interface Workflow {
  id: string;
  name: string;
  description?: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string;
  builtin?: boolean;
}

interface WorkflowNode {
  id: string;
  kind: 'input' | 'agent' | 'tool' | 'output';
  label: string;
  systemPrompt?: string;
  modelId?: string;
  toolIds?: string[];
  dependsOn?: string[];
  tier?: 'cheap' | 'standard';
  roleId?: string;
  ragFilter?: RagFilter;
  ragTopK?: number;
}

interface WorkflowEdge {
  from: string;
  to: string;
}
```

### Project
```typescript
interface Project {
  id: string;
  title: string;
  description?: string;
  genre?: string;
  status: 'draft' | 'completed';
  pinned: boolean;
  workflowId?: string;
  createdAt: string;
  updatedAt: string;
}
```

### ModelConfig (用户模型配置)
```typescript
interface ModelConfig {
  user_id: number;
  main_config: {
    adapter: 'ollama' | 'dashscope' | 'deepseek' | 'openai-compat';
    model_id: string;
    base_url?: string;
    api_key?: string;
    temperature?: number;
  };
  compression?: Record<string, any>;
  router_config?: Record<string, any>;
  tool_config?: Record<string, any>;
  vision_config?: Record<string, any>;
  embedding_config?: Record<string, any>;
}
```

---

## 7. SSE 事件规范

### 事件类型
| 事件名 | 触发时机 | data 字段 |
|--------|----------|-----------|
| `node_start` | 节点开始执行 | `{ node: string }` |
| `node_end` | 节点执行完成 | `{ node: string }` |
| `done` | 整个工作流执行完成 | `{ steps: WorkflowRunStep[] }` |
| `error` | 执行出错 | `{ error: string }` |

### WorkflowRunStep
```typescript
interface WorkflowRunStep {
  nodeId: string;
  label: string;
  output: string;
  status: 'running' | 'done' | 'error';
  systemPrompt?: string;
}
```
