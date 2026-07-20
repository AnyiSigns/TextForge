# text-forge 前端 API 接口文档（详细版 / 新手友好）

> 生成时间：2026-07-20（持续更新）
> 适用模式：生产构建（`NODE_ENV=production`）+ 服务端 rewrite 代理
> 请求路径：浏览器同源 `/api/*` → 由 `next.config.ts` 的 rewrites 转发到 `http://localhost:8000/api/*`
> 契约事实源：`openapi/seed-api.yaml`（由脚本生成 `src/types/generated.ts`）
> 阅读对象：后端同学（照此实现即可对接前端）+ 新加入的前端同学（照此理解调用）

---

## 目录

1. [先搞懂：文档里的 `?` 到底是什么意思（最重要）](#0-先搞懂文档里的-到底是什么意思最重要)
2. [通用约定](#1-通用约定)
   - [1.7 通用响应格式（统一信封）](#17-通用响应格式统一信封)
   - [1.8 thread_id（LangGraph 会话/线程）约定](#18-thread_idlanggraph-会话线程约定)
3. [部署与路由（已对齐）](#2-部署与路由已对齐)
4. [SSE 流式接口通用说明](#3-sse-流式接口通用说明)
5. [认证 / 用户（auth & user）](#4-认证--用户auth--user)
6. [项目（projects）](#5-项目projects)
7. [角色（characters）](#6-角色characters)
8. [生成 / 媒体（generation & media）](#7-生成--媒体generation--media)
9. [工作流（workflow）](#8-工作流workflow)
10. [知识库（knowledge / RAG）](#9-知识库knowledge--rag)
11. [API Keys（开放平台）](#10-api-keys开放平台)
12. [同步 / 探活 / 监控](#11-同步--探活--监控)
13. [SSE 事件流契约（后端就绪后启用）](#12-sse-事件流契约后端就绪后启用)
14. [后端必做优先级清单](#13-后端必做优先级清单)
15. [数据库字段（后端建表参考）](#14-数据库字段后端建表参考)
16. [后端实现约束](#15-后端实现约束来自前端契约)

---

## 0. 先搞懂：文档里的 `?` 到底是什么意思（最重要）

新手最常困惑的就是 `?`。它在文档里出现 **三种完全不同的含义**，请对号入座：

### 含义 A：URL 里的 `?` = 「查询参数（query string）的开始符号」

```
GET /api/knowledge/search?scope=public&q=李白
    └──── 路径 ─────┘  └────── 查询字符串 ──────┘
                      scope=public   AND   q=李白
                      (key=value)         (key=value)
```

- `?` 本身**不是参数名**，它只是一个分隔符，把「路径」和「查询参数」分开。
- `?` 后面的内容是 `key=value` 形式，多个参数用 `&` 连接。
- 查询参数通常是**可选的、用于过滤/分页/搜索**的，不写在路径里。
- 例：`?scope=public&q=李白` 意思是「scope 参数=public，q 参数=李白」。
- 在代码里，前端用 `params: { scope: 'public', q: '李白' }` 传递， axios / fetch 会自动拼成 `?scope=public&q=李白`。
- 带 `?` 的端点示例：`GET /api/knowledge/search?scope=public&q=关键词`、`GET /api/sync?since=&store=`、`GET /api/generate/image/results?project_id=xxx`、`GET /api/projects/{id}/portfolio?project_id=xxx`。

> 记忆口诀：**问号在网址里 = 问号后面是「搜索条件」**。

### 含义 B：TypeScript 类型里的 `字段名?` = 「这个字段是可选的」

在请求体 / 响应体的字段表里，你会看到：

```ts
interface Foo {
  id: string;        // 没有 ? → 必填（后端一定要给 / 前端一定要传）
  version?: number;  // 有 ?   → 可选（可能给，也可能不给）
}
```

- `version?: number` 里的 `?` 表示**这个字段可有可无**。
- 对响应：后端**可能返回** `version`，也可能不返回（比如创建时还没产生版本号）。前端已做好兼容，缺失不会报错。
- 对请求：前端**可能传**这个字段，也可能不传（比如更新时有时带 `If-Match` 就不需要 body 里再带 version）。
- 文档字段表里凡是标了 `?`，都代表可选。

> 记忆口诀：**问号在字段名后面 = 这个字段「看情况，可省」**。

### 含义 C：路径里的 `{id}?` 或「端点后带 ?」= 「可能有子路径 / 可选部分」

文档里偶尔把路径写成 `/api/characters/{id}?` 形式，这里的 `?` 借用了正则/文档习惯，表示「`{id}` 这一段之后**可能还有子路径**」。

- 例如 `/api/characters/{id}?` 实际包含：
  - `/api/characters/{id}`（详情）
  - `/api/characters/{id}/avatar`（头像）
  - `/api/characters/{id}/messages`（对话历史）
  - `/api/characters/{id}/chat`（对话）
- 这是**文档简写**，不是让你真的在 URL 里拼一个 `?`。真正的请求里 `{id}` 要换成真实 id，比如 `/api/characters/char-123`。

> 记忆口诀：**问号在路径末尾 = 这段后面可能还有东西，看子列表**。

---

## 1. 通用约定

### 1.1 Base URL（基础地址）

| 环境 | 浏览器实际请求的地址 | 说明 |
|---|---|---|
| 开发（dev） | `/api/...` | 由 `src/proxy.ts` 拦截，返回本地 mock 数据，不连真后端 |
| 生产（production） | `/api/...` | 由 `next.config.ts` 的 rewrite 转发到 `http://localhost:8000/api/...` |

- 前端代码里统一写**相对路径** `/api/xxx`（注意开头有 `/`）。
- 不要在前端写死 `http://localhost:8000`（那是 Next 服务端内部转发用的）。
- 生产环境 `NEXT_PUBLIC_API_URL` 必须留**空串**，否则会和 rewrite 冲突导致请求分两路。

### 1.2 鉴权头（Authorization）

绝大多数接口需要登录。前端 `apiClient` 会自动在请求头加：

```
Authorization: Bearer <accessToken>
```

- `accessToken` 来自登录接口返回的 `access_token`，前端存内存 + 持久化。
- 你（后端）只要在响应里返回 `access_token`，前端会自动带上。
- 不需要前端传 apiKey：**生成类请求只传 `model_id`，后端凭 id 去数据库取真正的 apiKey**（见 §7、§4 的 `PUT /api/user/models`）。

### 1.3 两个特殊请求头（并发安全）

| 请求头 | 什么时候带 | 作用 |
|---|---|---|
| `Idempotency-Key: <uuid>` | 所有 `POST/PUT/PATCH/DELETE` 自动带 | 幂等：网络重发时，后端用同一个 key 去重，避免重复创建 |
| `If-Match: <version>` | 带版本号的写请求（如更新项目） | 乐观锁：版本号不匹配（别人已改过）就返回 `412`，防止覆盖 |

前端 `apiClient.ts` 已自动处理；后端按需实现即可（不实现也不影响基本功能）。

### 1.4 401 自动刷新

当接口返回 `401`，前端拦截器会自动调用 `POST /api/auth/refresh`（带 `refresh_token` cookie）获取新 `access_token`，然后**自动重放**原请求。所以后端只要保证 `refresh` 接口可用，前端不会让用户频繁重新登录。

### 1.5 响应结构约定（后端务必遵守）

- **列表接口**：用 `{ "projects": [...] }` / `{ "characters": [...] }` / `{ "workflows": [...] }` / `{ "documents": [...] }` / `{ "keys": [...] }` 这种「单数键包数组」结构。
- **单资源接口**：用 `{ "project": {...} }` / `{ "character": {...} }` / `{ "workflow": {...} }` / `{ "task": {...} }` 这种「单数键包对象」结构。
- **删除成功**：返回 HTTP `204`（无 body），或返回 `{}` / `{ok:true}` 也可以，前端都兼容。
- **占位/未就绪**：如果后端某端点还没做好，但想让前端别卡死，返回体里加 `"mocked": true`，前端就会回退到本地数据。

### 1.6 状态码速查

| 状态码 | 含义 | 前端行为 |
|---|---|---|
| `200` | 成功 | 正常解析 |
| `201` | 创建成功 | 同 200（项目创建可能 201 或 200，前端都兼容） |
| `202` | 任务已受理（异步） | 同 200，之后轮询结果接口 |
| `204` | 删除成功 | 无 body |
| `400` | 参数错误 | 弹错误提示 |
| `401` | 未登录 / token 失效 | 自动 refresh，失败则跳登录 |
| `404` | 资源不存在 / 探活离线 | 探活接口用 404 表示「后端离线」 |
| `412` | 乐观锁版本冲突（If-Match 不匹配） | 提示「数据已被他人修改」 |
| `429` | 限流 | 自动重试 |
| `500+` | 服务端错误 | 自动重试 / 报错 |

### 1.7 通用响应格式（统一信封）

前端实际存在 **两种** 响应风格，后端二选一保持一致即可；**同一端点不要混用**。

#### 风格一：资源包装式（主流，推荐）

列表/详情/创建类接口使用「单数键包数据」的结构（见 §1.5）。这是前端 `src/types/generated.ts` 与 `openapi/seed-api.yaml` 约定的主要形式：

```jsonc
// 单资源
{ "project": { "id": "p_001", "title": "..." } }
{ "character": { "id": "char_1", "name": "..." } }
{ "workflow":  { "id": "wf_1", "name": "..." } }
{ "task":      { "id": "t_1", "kind": "image", ... } }

// 列表
{ "projects":   [ { ... }, { ... } ] }
{ "characters": [ { ... } ] }
{ "workflows":  [ { ... } ] }
{ "documents":  [ { ... } ] }
{ "keys":       [ { ... } ] }
{ "messages":   [ { ... } ] }
{ "chunks":     [ { ... } ] }

// 带版本号（并发写）
{ "project": { ... }, "version": 3 }
```

#### 风格二：统一信封式 `ApiResponse<T>`（简单接口 / 错误）

`src/types/common.ts` 定义了通用包装：`{ data?: T; error?: string; message?: string }`。适合「操作成功/失败」类接口（登录、刷新、简单动作、错误体）：

```jsonc
// 成功（带业务数据）
{ "data": { "brief": {...}, "outline": {...}, "characters": [...] }, "mocked": false }

// 成功（纯动作）
{ "message": "验证邮件已发送" }
{ "ok": true }

// 失败（前端同时识别 error / message 两种键）
{ "error": "邮箱或密码错误" }
{ "message": "邮箱或密码错误" }
```

#### 错误响应规范

- 业务错误返回对应 HTTP 状态码（4xx/5xx），body 用 `{ "message": "可读错误" }` 或 `{ "error": "..." }`，**二选一，前端都读得到**。
- 需要附加上下文时用 `{ "message": "...", "details": "..." }`（e2e mock 用过 `details`）。
- 401 时**不要**返回 HTML 登录页，返回 JSON `{ "message": "未登录" }` 即可，否则前端拦截器无法解析。

#### `mocked` 占位标记（贯穿所有风格）

任何响应体都可以带 `"mocked": true`（布尔），**含义：后端该端点未真正就绪，前端请回退本地数据**。建议所有「应有真实数据但暂时返回空/演示」的端点都带上它：

```jsonc
{ "workflows": [], "mocked": true }
{ "documents": [], "mocked": true }
{ "keys": [], "mocked": true }
```

#### 分页（目前未强制，预留约定）

当前接口多为**全量返回**（前端本地再做过滤），后端可直接返回数组。若数据量大需要分页，推荐以下两种之一，并请在文档/OpenAPI 注明：

```jsonc
// 方式 A：页码分页
{ "items": [ ... ], "total": 120, "page": 1, "pageSize": 20 }

// 方式 B：游标分页
{ "items": [ ... ], "nextCursor": "eyJvZmZzZXQiOjIwfQ==" }
```

> 前端目前没有统一分页消费逻辑，接入分页前请先与前端约定字段名，避免各端点不一致。

---

### 1.8 thread_id（LangGraph 会话/线程）约定

后端用 **LangGraph**，所有「可续聊 / 可续生成」的端点引入 `thread_id`——它是 LangGraph 里一个**会话/生成过程的唯一标识**（对应 checkpointer 的 thread）。

#### 生成与返回规则

- **后端生成、首次返回**（已与后端确认）：
  - 请求**不带** `thread_id` → 后端新建 thread，生成 `thread_id`。
  - 请求**带** `thread_id` → 后端从 checkpointer **resume** 该线程，继续上下文。
- **返回方式**：
  - **SSE 接口**：流的**第一条**发一个 `meta` 事件：
    ```
    data: {"type":"meta","thread_id":"th_01HX..."}
    ```
  - **非 SSE / 一次性返回接口**：响应体直接加 `"thread_id": "th_01HX..."` 字段。
- **前端缓存复用**：拿到 `thread_id` 后按维度缓存（角色+项目 / 项目+工作流），同一会话后续请求都带上，后端据此 resume。

#### 历史读取（检查点权威 + 自定义表读优化 混合架构）

- **短期记忆**（本轮对话进行中的 LangGraph 运行时状态）= **checkpointer（权威）**，是 resume 的真相源，前端不感知其内部。
- **长期历史**（已落库的消息记录）= **自定义表（读优化）**，前端用 `GET /api/characters/{id}/messages?thread_id=` 读取，**不再每轮把整段 `messages` 数组上送**。
- 因此 chat 请求里的 `messages` 字段降级为**可选**：有 `thread_id` 时后端忽略它、改从 checkpointer / DB 读历史；仅首次（无 thread）可用来播种（通常首轮历史为空）。

#### 推荐 thread 作用域（scope，字符串由后端定，前端只透传）

| 端点 | 推荐 thread 维度 | 说明 |
|---|---|---|
| 角色对话 `§6.8` | `character:{id}` + `project:{pid}` | **同一角色在不同项目下是不同会话**，避免串戏 |
| 对话历史 `§6.7` | 同上（GET 用 `?thread_id=` 指定） | 缺省取该角色最新/默认会话 |
| 项目生成 `§5.9` | `project:{id}` + `workflow:{wid}` | 一个项目的正文生成是一条会话 |
| 开局 seed `§5.12/§5.13` | `project:{id}` + `part` | 分次补 brief/outline/characters 可同 thread |
| 工作流运行 `§8.6` | `workflow:{id}`（+ `project`） | 预留 |

#### 涉及端点

`§5.9`、`§5.12`、`§5.13`、`§6.7`（GET 加 `?thread_id`）、`§6.8`、`§8.6`。下面各节已逐个补上 `thread_id?`。

#### 落地检查清单（前端源码需同步修改，别漏）

契约改了，以下前端位置要跟着改，否则 `thread_id` 不会真正上送/缓存：

1. **`openapi/seed-api.yaml`**（契约事实源）：在 `ChatMessageRequest`、`/projects/{id}/generate` 请求体、`ImageGenerationRequest`/`VideoGenerationRequest`（如适用）、seed 相关 schema 增加 `thread_id`（可选）；相应响应 schema 增加 `thread_id`。改完跑 `scripts/gen-api-types.mjs` 重新生成 `src/types/generated.ts`。
2. **`src/types/chat.ts` / `ChatMessageRequest`**：加 `thread_id?`；`Message` 历史不再必传。
3. **`src/features/characters/api/characters.ts` → `sendChatMessage`**（约 82 行）：请求体加 `thread_id?`；解析 SSE 首条 `meta` 事件取出 `thread_id` 并缓存（建议按 `character+project` 维度存 `useCharacterStore` 或本地 map）；`messages` 改为仅首轮/无 thread 时发送。
4. **`src/lib/seed/generate.ts` → `fetchSeed` / `streamSeed`**（约 87、193 行）：请求体加 `thread_id?`；`streamSeed` 的 reader 需识别首条 `meta` 事件并缓存 `thread_id` 供下次回传。
5. **`src/features/projects/api/projects.ts` → `generateProject`**（约 75 行）与本地 `generateWithWorkflow`：请求体加 `thread_id?`，SSE 首条 `meta` 取回缓存。
6. **`src/features/characters/stores/characterStore.ts`**：新增「`characterId+projectId → thread_id`」缓存映射；`fetchCharacterMessages` 调用 `GET /messages?thread_id=` 时带上。
7. **`src/features/workflow/api/workflowRunner.ts`**：`run` 请求加 `thread_id?` 并消费首条 `meta`（预留）。
8. **`src/mocks/index.ts` 与 `e2e/full.spec.ts`**：SSE 处理器在流首补 `data: {"type":"meta","thread_id":"mock-th-xxx"}`，非 SSE 响应体补 `"thread_id"`，保证端到端可跑通。

> 后端对应改动：checkpointer 配置（如 `PostgresSaver`）+ 新建 `conversation_threads` / `thread_messages` 两表（见 §14.12、§14.13）+ 在首次请求时生成 `thread_id` 并透传给 checkpointer。

---

## 2. 部署与路由（已对齐）

- **proxy.ts 行为**：仅 `NODE_ENV !== 'production'` 时，dev mock 拦截 `/api/*`；生产构建关闭 mock，所有 `/api/*` 走 rewrite。
- **next.config.ts**：生产环境 `rewrites`: `source: /api/:path*` → `destination: http://localhost:8000/api/:path*`。
- **env 对齐**：`.env.production` 的 `NEXT_PUBLIC_API_URL` 必须为空串，使浏览器走同源 `/api/*`，由 Next 服务端转发。
- **前端回退策略**：知识库、工作流、seed、模型同步等端点带 `try/catch` + `mocked` 标记，部分端点未就绪不会卡死 UI；但标注「强依赖 / 必做」的端点无兜底，缺失会直接报错。

---

## 3. SSE 流式接口通用说明

部分接口（角色对话、项目生成、seed 流式、工作流运行）使用 **SSE（Server-Sent Events，服务器推送事件）**，而不是一次性返回 JSON。

- 响应头：`Content-Type: text/event-stream`
- 数据格式：每行以 `data: ` 开头，事件之间用空行 `\n\n` 分隔。
- 前端 `shared/lib/sse.ts` 逐行读取，解析 `data: <json>`。
- 流结束：后端发送 `data: [DONE]` 或关闭连接；前端忽略 `[DONE]`。
- 示例流：

```
data: {"type":"agent_switch","agent":"world"}

data: {"type":"chunk","content":"世界设定内容……"}

data: {"type":"step_complete"}

data: [DONE]
```

---

## 4. 认证 / 用户（auth & user）

> 通用请求头（除 refresh/logout 外都建议带，但前端 login 之后会自动带）：`Authorization: Bearer <access_token>`

### 4.1 POST `/api/auth/login` —— 登录（强依赖，必做）

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "123456"
}
```

**响应 200：**

```json
{
  "access_token": "eyJhbGciOi...（JWT 或随机串）",
  "refresh_token": "rt-xxxxx",
  "user": {
    "id": "u_1001",
    "username": "墨小鱼",
    "email": "user@example.com",
    "avatar": "https://.../avatar.png",   // 可选，没有就给 "" 或省略
    "isVerified": true,
    "createdAt": "2026-01-02T08:00:00.000Z"
  }
}
```

| 字段 | 类型 | 必返回 | 说明 |
|---|---|---|---|
| access_token | string | ✅ | 前端后续请求都带它 |
| refresh_token | string | ✅ | 用于 refresh 接口换 token（后端用 httpOnly cookie 也行） |
| user.id | string | ✅ | 用户主键 |
| user.username | string | ✅ | 昵称 |
| user.email | string | ✅ | 邮箱 |
| user.avatar | string? | ❌ | 头像 URL，可空 |
| user.isVerified | boolean | ✅ | 是否已验证邮箱 |
| user.createdAt | string | ✅ | ISO 时间字符串 |

- 登录失败返回 `401 { "message": "邮箱或密码错误" }`。

### 4.2 POST `/api/auth/register` —— 注册（必做）

```http
POST /api/auth/register
Content-Type: application/json

{ "username": "墨小鱼", "email": "new@example.com", "password": "123456" }
```

- `username` 必填（前端注册表单「用户名」为 required，`register/page.tsx:41` 实际发送 `{ username, email, password }`）。
- `email` 建议做唯一校验。

**响应 200：**

```json
{ "message": "验证邮件已发送", "email": "new@example.com" }
```

- 邮箱已存在返回 `400 { "message": "邮箱已被注册" }`。

### 4.3 POST `/api/auth/refresh` —— 刷新 token（强依赖，必做）

- 前端在 `401` 时**自动调用**，用来续命，用户无感知。
- 靠 cookie（`tf_rt`）识别用户，不需要请求体。

```http
POST /api/auth/refresh
Content-Type: application/json

{ }
```

**响应 200：**

```json
{
  "access_token": "eyJhbGciOi...（新 token）",
  "user": { "id": "u_1001", "username": "墨小鱼", "email": "user@example.com", "isVerified": true, "createdAt": "..." }
}
```

- `user` 可选，有就更新前端用户态，没有只更新 token。

### 4.4 POST `/api/auth/verify-email` —— 邮箱验证（必做）

```http
POST /api/auth/verify-email
Content-Type: application/json

{ "code": "123456" }     // 或 { "token": "xxx" }，按你的验证码方案来
```

**响应 200：** `{ "message": "ok" }`

> 补充：e2e 测试还出现了 `/api/auth/send-verify-code`（发验证码）和 `/api/auth/resend-verify`（重发），如后端有验证码流程请一并实现，前端目前走 mock。

### 4.5 POST `/api/auth/logout` —— 退出（必做，带 `.catch` 兜底）

```http
POST /api/auth/logout
```

**响应 200：** `{}`（或不返回 body）。前端本地会清掉登录态，后端清 cookie 即可。

### 4.6 PUT `/api/user/profile` —— 保存个人资料（必做）

```http
PUT /api/user/profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "username": "新昵称",     // 可选
  "email": "new@example.com" // 可选
}
```

**响应 200：**

```json
{
  "user": {
    "id": "u_1001", "username": "新昵称", "email": "new@example.com",
    "avatar": "", "isVerified": true, "createdAt": "..."
  }
}
```

### 4.7 POST `/api/user/change-password` —— 修改密码（设置页，必做）

```http
POST /api/user/change-password
Authorization: Bearer <token>
Content-Type: application/json

{ "oldPassword": "123456", "newPassword": "abcdef" }
```

**响应 200：** `{}`

### 4.8 POST `/api/user/change-password-by-email` —— 邮箱改密（设置页，必做）

用于「忘记密码 / 邮箱验证后改密」流程：

```http
POST /api/user/change-password-by-email
Content-Type: application/json

{ "email": "user@example.com", "code": "123456", "newPassword": "abcdef" }
```

**响应 200：** `{}`

### 4.9 POST `/api/user/avatar` —— 头像上传（必做）

```http
POST /api/user/avatar
Authorization: Bearer <token>
Content-Type: multipart/form-data

------WebKitFormBoundary
Content-Disposition: form-data; name="file"; filename="avatar.png"
Content-Type: image/png

（二进制文件内容）
```

> ⚠️ 注意：multipart 请求**不要手动设置** `Content-Type`，浏览器会自动带 `boundary=...`。手动设会丢 boundary 导致后端 400。

**响应 200：**

```json
{ "avatar_url": "https://.../uploads/avatar.png" }
```

### 4.10 PUT `/api/user/models` —— 同步用户模型配置（强依赖，必做）

> 这是**密钥唯一可信保管方**。前端本地不长期存 apiKey 明文（IndexedDB 里 apiKey 被置空），只存模型 `id`。生成请求只带 `model_id`，后端凭 id 取 `adapter/baseUrl/apiKey/category/modalities/tier`。

```http
PUT /api/user/models
Authorization: Bearer <token>
Content-Type: application/json

{
  "models": [
    {
      "id": "m_01HX...",          // 必填，前端 uid，也是生成请求携带的 model_id
      "name": "GPT-4o",           // 必填
      "category": "llm",          // 必填：llm | vision | omni | speech | embedding
      "deployment": "cloud",      // cloud | local
      "vendor": "OpenAI",         // 厂商名
      "adapter": "openai",        // 必填：后端据此选调用库（openai/anthropic/kling/...）
      "baseUrl": "https://api.openai.com/v1", // 可选
      "apiKey": "sk-xxxx",        // 明文仅此一次上交后端保管；前端本地不留
      "modelId": "gpt-4o",        // 必填：实际传给厂商的模型名
      "isDefault": true,
      "modalities": ["image"],    // 仅 vision/omni 有意义
      "auxiliary": []             // 可选，llm 的辅助模型
    }
  ]
}
```

**响应 200：**

```json
{ "version": 12 }   // version 可选，用于乐观锁/同步
```

> `UserModelConfig` 详见 `openapi/seed-api.yaml`。生成请求只带 `model_id`（用户模型主键）；后端凭 id 取配置，**不要要求前端直传 apiKey**。

---

## 5. 项目（projects）

### 5.1 GET `/api/projects` —— 项目列表（强依赖，必做）

```http
GET /api/projects
Authorization: Bearer <token>
```

- 查询参数（可选，`?` 含义 A）：`?status=draft&search=关键词&genre=科幻`，后端按需实现过滤，不实现也行（返回全量）。

**响应 200：**

```json
{
  "projects": [
    {
      "id": "p_001",
      "title": "星海拾荒者",
      "status": "draft",                       // draft | generating | completed | paused
      "genre": "科幻",                          // 可选
      "description": "记忆晶核串联逝者与生者",  // 可选
      "pinned": false,                         // 可选，是否置顶
      "workflowId": "wf-builtin",              // 可选，绑定的流水线
      "createdAt": "2026-01-02T08:00:00.000Z",
      "updatedAt": "2026-01-03T09:00:00.000Z"
    }
  ]
}
```

### 5.2 POST `/api/projects` —— 创建项目（必做）

```http
POST /api/projects
Authorization: Bearer <token>
Content-Type: application/json

{
  "title": "星海拾荒者",
  "description": "记忆晶核串联逝者与生者",
  "genre": "科幻",
  "version": 0            // 可选
}
```

**响应 201（或 200）：**

```json
{
  "project": {
    "id": "p_001", "title": "星海拾荒者", "status": "draft",
    "genre": "科幻", "description": "...", "pinned": false,
    "createdAt": "...", "updatedAt": "..."
  },
  "version": 1            // 可选
}
```

### 5.3 GET `/api/projects/{id}` —— 项目详情（强依赖，必做）

```http
GET /api/projects/p_001
Authorization: Bearer <token>
```

**响应 200（`ProjectDetail`）：**

```json
{
  "project": { "id": "p_001", "title": "...", "status": "draft", ... },
  "steps": [
    {
      "id": "step_1",
      "agent": "writer",          // 节点/角色标识
      "agentName": "写作",         // 可选，展示名
      "content": "第一章正文……",
      "status": "completed",       // 状态字符串
      "nodeId": "writer"           // 可选，合并键
    }
  ],
  "characters": [
    { "id": "char_1", "name": "林墨", "description": "沉默的拾荒者" }
  ]
}
```

### 5.4 PUT `/api/projects/{id}` —— 更新项目（必做）

```http
PUT /api/projects/p_001
Authorization: Bearer <token>
Content-Type: application/json

{
  "workflowId": "wf-demo-1",   // 绑定流水线，可选
  "title": "新标题",            // 可选
  "description": "新简介",      // 可选
  "genre": "都市"               // 可选
}
```

**响应 200：** `{ "project": {...}, "version": 2 }`

### 5.5 DELETE `/api/projects/{id}` —— 删除项目（必做）

```http
DELETE /api/projects/p_001
Authorization: Bearer <token>
If-Match: 2            // 可选乐观锁；版本不符返回 412
```

**响应 204**（无 body）或 `{}`。

### 5.6 GET `/api/projects/{id}/characters` —— 项目角色列表（必做）

**响应 200：**

```json
{ "characters": [ { "id": "char_1", "name": "林墨", "description": "..." } ] }
```

### 5.7 PUT `/api/projects/{id}/steps/{stepId}` —— 保存某步正文（强依赖，必做）

```http
PUT /api/projects/p_001/steps/step_1
Authorization: Bearer <token>
Content-Type: application/json

{ "content": "更新后的正文……" }
```

**响应 200：** `{ "step": {...} }` 或 `{ "ok": true }`（前端两种都兼容）。

### 5.8 POST `/api/projects/{id}/confirm` —— 确认某步（必做）

```http
POST /api/projects/p_001/confirm
Authorization: Bearer <token>
Content-Type: application/json

{ "step_id": "step_1" }
```

**响应 200：** `{ "ok": true }` 或 `{ "project": {...} }`。

### 5.9 POST `/api/projects/{id}/generate` —— 触发项目正文生成（SSE，强依赖，必做）

```http
POST /api/projects/p_001/generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "workflowId": "wf-builtin",                 // 可选
  "model_id": "m_01HX...",                   // 可选，正文模型 id
  "category": "llm",                         // 可选：llm|vision|omni|speech|embedding
  "thread_id": "th_proj_p_001_wf_builtin"    // 可选：续生成时带上以 resume；首轮省略，后端新建并返回
}
```

**响应：** SSE 流（见 §12）。首条为 `meta` 事件带回 `thread_id`，之后是内容事件：

```
data: {"type":"meta","thread_id":"th_proj_p_001_wf_builtin"}
data: {"type":"agent_switch","agent":"world"}
data: {"type":"chunk","content":"世界设定内容……"}
data: {"type":"step_complete"}
data: [DONE]
```

或一次性返回：`{ "steps": [ Step, ... ], "thread_id": "th_proj_p_001_wf_builtin" }`。

### 5.10 POST `/api/projects/{id}/brief` —— 保存创作设定（必做，写库）

```http
POST /api/projects/p_001/brief
Authorization: Bearer <token>
Content-Type: application/json

{
  "brief": {
    "projectId": "p_001",
    "genre": "科幻",
    "worldview": "文明记忆正随星海漂流消散",
    "tone": "苍凉而温柔",
    "forbidden": "避免硬科幻术语堆砌",
    "styleGuide": "诗化白描",
    "wordCountGoal": 80000,
    "dailyWordCountGoal": 1000,
    "sections": [
      { "id": "sec-1", "title": "核心矛盾", "content": "...", "pinned": true }
    ]
  }
}
```

**响应 200：** `{ "ok": true }`

### 5.11 POST `/api/projects/{id}/summarize` —— 大纲摘要（必做，带本地回退）

```http
POST /api/projects/p_001/summarize
Authorization: Bearer <token>
Content-Type: application/json

{ "text": "很长的一段正文或大纲……" }
```

**响应 200：** `{ "summary": "压缩后的摘要文本……" }`

### 5.12 POST `/api/projects/{id}/seed` —— 一句话开局（必做，带本地 mock 回退）

把用户一句话生成「设定 brief + 大纲 outline + 角色 characters」三件套。

```http
POST /api/projects/p_001/seed
Authorization: Bearer <token>
Content-Type: application/json

{
  "prompt": "一个关于遗忘与重逢的科幻故事",
  "part": "brief",                 // 可选：只补某一项 brief|outline|characters
  "context": {                     // 可选：中途单补时带当前项目快照，保证自洽
    "brief": { "genre": "科幻", "worldview": "..." },
    "existingCharacterIds": ["char_1"],
    "outlineSummary": "第一卷/第一章/开篇钩子"
  },
  "thread_id": "th_seed_p_001"     // 可选：分次补同一开局时带上以复用同一生成会话；首轮省略
}
```

**响应 200（推荐结构）：**

```json
{
  "data": {
    "brief": {
      "genre": "科幻", "worldview": "……", "tone": "苍凉而温柔",
      "forbidden": "……", "styleGuide": "……",
      "wordCountGoal": 80000, "dailyWordCountGoal": 1000,
      "sections": [ { "id": "sec-core", "title": "核心矛盾", "content": "……", "pinned": true } ]
    },
    "outline": {
      "volumes": [
        {
          "id": "vol-1", "title": "第一卷",
          "chapters": [
            {
              "id": "ch-1", "title": "第一章",
              "nodes": [
                { "id": "nd-1", "title": "开篇钩子", "content": "……", "targetWords": 2000 }
              ]
            }
          ]
        }
      ]
    },
    "characters": [
      { "id": "char-1", "name": "林墨", "description": "沉默的拾荒者", "role": "protagonist", "status": "存活", "currentProfile": "……" }
    ]
  },
  "thread_id": "th_seed_p_001",     // 首轮由后端生成并返回；续补时前端回传
  "mocked": false            // 占位/未就绪时给 true，前端回退本地
}
```

> 兼容说明：前端 `fetchSeed` 读取 `data.data` 且忽略 `data.mocked` 为真的情况；后端也可直接返回扁平的 `{ brief, outline, characters }`，前端回填逻辑会自适应。

### 5.13 POST `/api/projects/{id}/seed/stream` —— 开局流式（可选，回退整包）

同 5.12 的请求，但返回 SSE，分步产出 `brief → outline → characters`（事件形状见 §12）。未就绪时前端回退到整包 `/seed`。

```http
POST /api/projects/p_001/seed/stream
Authorization: Bearer <token>
Content-Type: application/json

{ "prompt": "一个关于遗忘与重逢的科幻故事", "thread_id": "th_seed_p_001" }
```

> `thread_id` 可选：首轮省略由后端新建并返回（流式首条 `meta` 事件），续补时前端回传以复用同一开局会话。

### 5.14 GET `/api/projects/{id}/portfolio` —— 作品集聚合（必做，带子接口回退）

```http
GET /api/projects/p_001/portfolio?project_id=p_001
Authorization: Bearer <token>
```

**响应 200：**

```json
{
  "items": [
    { "id": "task_1", "kind": "image", "prompt": "林墨立绘", "status": "completed", "result_url": "https://.../img.png", "createdAt": "..." }
  ]
}
```

---

## 6. 角色（characters）

### 6.1 GET `/api/characters` —— 角色列表（必做）

```http
GET /api/characters
Authorization: Bearer <token>
```

**响应 200：**

```json
{
  "characters": [
    {
      "id": "char_1",
      "name": "林墨",
      "avatar": "https://.../a.png",     // 可选
      "aliases": ["墨哥"],                 // 可选
      "description": "沉默的拾荒者",
      "role": "protagonist",              // 可选：主角/配角/反派…
      "status": "存活",                    // 可选
      "currentProfile": "刚经历一次失去",  // 可选
      "customRole": "",                    // 可选
      "relationships": [                  // 可选
        { "id": "rel_1", "targetId": "char_2", "relation": "旧识" }
      ],
      "projectId": "p_001",               // 可选
      "images": ["https://.../x.png"],    // 可选
      "referenceImages": ["https://.../r.png"], // 可选
      "referenceImage": "",               // 可选
      "imageSeed": 123,                   // 可选
      "createdAt": "2026-01-02T08:00:00.000Z"
    }
  ]
}
```

### 6.2 POST `/api/characters` —— 创建角色（必做）

```http
POST /api/characters
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "林墨",
  "description": "沉默的拾荒者",
  "projectId": "p_001",    // 可选
  "avatar": ""             // 可选
}
```

**响应 201（或 200）：** `{ "character": { ...Character } }`

### 6.3 GET `/api/characters/{id}` —— 角色详情（必做）

**响应 200：** `{ "character": { ...Character } }`

### 6.4 PUT `/api/characters/{id}` —— 更新角色（必做）

```http
PUT /api/characters/char_1
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "林墨",
  "description": "更新后的描述",
  "avatar": "https://.../a.png",
  "images": ["https://.../x.png"],
  "role": "protagonist",
  "customRole": "",
  "status": "存活",
  "currentProfile": "当前状态详情",
  "relationships": [ { "id": "rel_1", "targetId": "char_2", "relation": "旧识" } ],
  "referenceImages": ["https://.../r.png"],  // 取消时传 null
  "imageSeed": 123                          // 取消时传 null
}
```

**响应 200：** `{ "character": { ...Character } }`

### 6.5 DELETE `/api/characters/{id}` —— 删除角色（必做）

**响应 204** 或 `{}`。

### 6.6 POST `/api/characters/{id}/avatar` —— 头像上传（必做）

```http
POST /api/characters/char_1/avatar
Authorization: Bearer <token>
Content-Type: multipart/form-data

（表单字段 name="file"，值为图片二进制）
```

**响应 200：** `{ "avatar_url": "https://.../a.png" }`（前端取 `avatar_url | url | avatar` 三者之一）

### 6.7 GET `/api/characters/{id}/messages` —— 对话历史（必做）

```http
GET /api/characters/char_1/messages?thread_id=th_char_char_1_proj_p_001
Authorization: Bearer <token>
```

- `thread_id` **可选**：指定读取哪条会话的历史；省略时返回该角色**最新/默认会话**的历史（按 `project` 维度，无 project 则全局默认）。
- 历史来源：后端按 `thread_id` 从**自定义历史表**读取（见 §14）；短期记忆本身由 checkpointer 管理，不在此返回。

**响应 200：**

```json
{
  "thread_id": "th_char_char_1_proj_p_001",
  "messages": [
    { "id": "m_1", "role": "user", "content": "你好" },
    { "id": "m_2", "role": "assistant", "content": "我是林墨。" }
  ]
}
```

### 6.8 POST `/api/characters/{id}/chat` —— 角色对话（SSE，必做）

```http
POST /api/characters/char_1/chat
Authorization: Bearer <token>
Content-Type: application/json

{
  "message": "你好，你是谁？",
  "project_id": "p_001",                 // 可选；也决定 thread 维度（不同项目=不同会话）
  "brief": "本项目设定：科幻星海……",      // 可选
  "character_name": "林墨",               // 可选
  "character_description": "沉默的拾荒者", // 可选
  "messages": [                          // 可选：仅首次（无 thread_id）可用于播种；有 thread_id 时后端忽略，改从 checkpointer/DB 读历史
    { "id": "m_1", "role": "user", "content": "你好" }
  ],
  "thread_id": "th_char_char_1_proj_p_001"  // 可选：续聊时带上以 resume；首轮省略，后端新建并通过首条 meta 事件返回
}
```

**响应：** SSE 流。第一条为 `meta` 事件带回 `thread_id`，之后逐字内容事件：

```
data: {"type":"meta","thread_id":"th_char_char_1_proj_p_001"}
data: {"content":"我是"}
data: {"content":"林墨。"}
data: [DONE]
```

> 前端从首条 `meta` 事件取出 `thread_id` 缓存，下一轮同一会话请求带上即可续聊。

---

## 7. 生成 / 媒体（generation & media）

> `MediaTask` 字段（所有生成任务都返回它，包在 `task` 或数组里）：
> `{ id, kind:'image'|'video', prompt, status:'pending'|'processing'|'completed'|'failed', progress?, result_url?, project_id?, source?, source_ref?, chapter_id?, character_ids?[], storyboard?, createdAt }`

### 7.1 POST `/api/generate/image` —— AI 绘画（强依赖，必做，无兜底）

```http
POST /api/generate/image
Authorization: Bearer <token>
Content-Type: application/json

{
  "prompt": "林墨站在星海残骸带，发光的记忆晶核",
  "negative_prompt": "模糊, 低质量",       // 可选
  "model_id": "m_vision_01",              // 可选，视觉模型 id（后端凭 id 取 apiKey）
  "project_id": "p_001",                  // 可选
  "style": "写实",                         // 可选
  "size": "1024x1024",                    // 可选
  "count": 1,                             // 可选
  "characterId": "char_1",                // 可选
  "reference_images": ["https://.../r.png"], // 可选
  "seed": 42,                             // 可选
  "source_step": "step_1",                // 可选
  "character_ids": ["char_1"],            // 可选
  "context": {                            // 可选（GenerationContext，见 §7 附录）
    "project_title": "星海拾荒者",
    "summary": "……",
    "characters": [ { "name": "林墨", "description": "……", "status": "存活" } ]
  }
}
```

**响应 200 / 202：**

```json
{
  "task": {
    "id": "task_1", "kind": "image", "prompt": "林墨……",
    "status": "pending", "progress": 0,
    "result_url": "", "project_id": "p_001",
    "createdAt": "2026-01-02T08:00:00.000Z"
  }
}
```

### 7.2 GET `/api/generate/image/results` —— 图片结果轮询（必做）

```http
GET /api/generate/image/results?project_id=p_001
Authorization: Bearer <token>
```

**响应 200：** `{ "tasks": [ MediaTask ], "results": [ MediaTask ] }`（两个键前端任取其一）

### 7.3 POST `/api/video/generate` —— AI 视频（强依赖，必做）

```http
POST /api/video/generate
Authorization: Bearer <token>
Content-Type: application/json

{
  "prompt": "林墨在星海中漂流的镜头",
  "model_id": "m_video_01",               // 可选
  "project_id": "p_001",                  // 可选
  "duration": 5,                         // 可选，秒
  "aspect": "16:9",                       // 可选
  "reference_images": ["https://.../r.png"], // 可选
  "chapter_id": "ch-1",                  // 可选
  "character_ids": ["char_1"],           // 可选
  "storyboard": "分镜脚本文本",            // 可选
  "context": { "project_title": "星海拾荒者", "summary": "……" }  // 可选
}
```

**响应 200 / 202：** `{ "task": { ...MediaTask, "kind":"video" } }`

### 7.4 GET `/api/video/tasks` —— 视频任务轮询（必做）

```http
GET /api/video/tasks
Authorization: Bearer <token>
```

**响应 200：** `{ "tasks": [ MediaTask ] }`

### 7.5 POST `/api/projects/{id}/generate` —— 见 §5.9（SSE 正文生成）

### 7.6 POST `/api/ai/transform` —— AI 文改（必做，带本地回退）

```http
POST /api/ai/transform
Authorization: Bearer <token>
Content-Type: application/json

{ "action": "expand", "text": "原文段落……" }
```

- `action`：`expand`（扩写）| `rewrite`（改写）| `summarize`（摘要）。

**响应 200：** `{ "output": "处理后的文本……" }`

---

## 8. 工作流（workflow）

> `WorkflowSummary`：`{ id, name, description? }`
> `Workflow`（完整）：`{ id, name, description?, createdAt, updatedAt, builtin?, nodes:[{id, kind, label, modelId?, systemPrompt?, roleId?, tier?, dependsOn?[]}], edges:[{from,to}] }`

### 8.1 GET `/api/workflows` —— 流水线列表（必做，回退本地）

```http
GET /api/workflows
Authorization: Bearer <token>
```

**响应 200：**

```json
{
  "workflows": [
    { "id": "wf-builtin", "name": "内置创作流水线", "description": "策划→世界观→角色→大纲→写作→审校→总编" }
  ],
  "mocked": false            // 未就绪给 true，前端回退本地
}
```

### 8.2 GET `/api/workflows/{id}` —— 流水线详情（必做，回退本地）

**响应 200：** `{ "workflow": { ...Workflow }, "mocked": false }`

### 8.3 PUT `/api/workflows/{id}` —— 保存流水线（必做，回退本地）

```http
PUT /api/workflows/wf-demo-1
Authorization: Bearer <token>
Content-Type: application/json

{
  "id": "wf-demo-1", "name": "章节生成与提炼",
  "description": "生成标题→提炼压缩",
  "createdAt": "2026-01-01T00:00:00.000Z", "updatedAt": "2026-01-02T00:00:00.000Z",
  "nodes": [
    { "id": "n1", "kind": "input", "label": "项目上下文" },
    { "id": "n2", "kind": "agent", "label": "生成标题", "systemPrompt": "……" },
    { "id": "n3", "kind": "agent", "label": "提炼", "systemPrompt": "……", "dependsOn": ["n2"] }
  ],
  "edges": [ { "from": "n1", "to": "n2" }, { "from": "n2", "to": "n3" } ]
}
```

**响应 200：** `{ "workflow": { ...Workflow } }`

### 8.4 POST `/api/workflows` —— 新建流水线（必做，回退本地）

请求体同上（无 `id` 或后端生成 id）。**响应 200：** `{ "workflow": { ...Workflow } }`

### 8.5 DELETE `/api/workflows/{id}` —— 删除流水线（必做，回退本地）

**响应 200：** `{}` 或 `{ "ok": true, "mocked": false }`

### 8.6 POST `/api/workflows/{id}/run` —— 运行流水线（可选，预留 SSE）

后端就绪后启用，替换前端本地 DAG。请求体按后端方案定，**响应为 SSE 流**（事件形状同 §12），首条建议发 `meta` 事件带回 `thread_id` 以便续跑/排查：

```http
POST /api/workflows/wf-demo-1/run
Authorization: Bearer <token>
Content-Type: application/json

{ "project_id": "p_001", "thread_id": "th_wf_wf-demo-1_proj_p_001" }
```

```
data: {"type":"meta","thread_id":"th_wf_wf-demo-1_proj_p_001"}
data: {"type":"agent_switch","agent":"writer"}
data: {"type":"chunk","content":"……"}
data: [DONE]
```

---

## 9. 知识库（knowledge / RAG）

> `KbDocMeta`：`{ id, name, status:'indexing'|'indexed'|'failed', createdAt, scope:'personal'|'public', uploaderId?, uploaderName?, content? }`
> `RagChunk`：`{ docId, docName, text, score, uploaderName? }`

### 9.1 GET `/api/knowledge` —— 个人库列表（必做，回退本地 IndexedDB）

```http
GET /api/knowledge
Authorization: Bearer <token>
```

**响应 200：** `{ "documents": [ KbDocMeta ], "mocked": false }`

### 9.2 POST `/api/knowledge/upload` —— 个人库上传（必做，回退本地建索引）

```http
POST /api/knowledge/upload
Authorization: Bearer <token>
Content-Type: application/octet-stream   // 注意：直接传文件二进制 body，不要包成 JSON

（文件二进制内容）
```

> ⚠️ 前端是 `body: file` 直接发二进制，**不要手动设 Content-Type**（让浏览器自动带 boundary）。

**响应 200：** `{}` 或 `{ "document": KbDocMeta }`

### 9.3 DELETE `/api/knowledge/{id}` —— 个人库删除（必做，回退本地）

**响应 200：** `{}`

### 9.4 GET `/api/knowledge/public` —— 公共库列表（必做，回退演示语料）

**响应 200：** `{ "documents": [ KbDocMeta ], "mocked": false }`

### 9.5 GET `/api/knowledge/public/{id}` —— 公共库内容（必做，回退演示）

**响应 200：** `{ "content": "文档正文文本……" }`

### 9.6 GET `/api/knowledge/public/{id}/download` —— 公共库下载（必做，回退演示）

**响应 200：** `blob`（文件流，前端直接下载）

### 9.7 GET `/api/knowledge/search?scope=public&q=关键词` —— 公共库检索（必做，回退演示）

```http
GET /api/knowledge/search?scope=public&q=李白
Authorization: Bearer <token>     // 可选
```

- `?scope=public` 表示在公共库搜；`&q=李白` 是搜索词（中文需 URL 编码，前端已 `encodeURIComponent`）。

**响应 200：**

```json
{
  "chunks": [
    { "docId": "pub-1", "docName": "古典诗词格律参考.md", "text": "平仄是古典诗词的声调规则……", "score": 2, "uploaderName": "示例作者" }
  ]
}
```

> 个人库默认端侧向量检索（浏览器本地），不依赖后端；仅上传/列表/删除需后端对齐。

---

## 10. API Keys（开放平台）

> `ApiKey`：`{ id, name, key, createdAt, lastUsed }`

### 10.1 GET `/api/api-keys` —— 密钥列表（强依赖，必做）

```http
GET /api/api-keys
Authorization: Bearer <token>
```

**响应 200：**

```json
{
  "keys": [
    { "id": "k_1", "name": "我的第一个密钥", "key": "sk-xxxx", "createdAt": "2026-01-02T08:00:00.000Z", "lastUsed": null }
  ]
}
```

### 10.2 POST `/api/api-keys` —— 创建密钥（必做）

```http
POST /api/api-keys
Authorization: Bearer <token>
Content-Type: application/json

{ "name": "我的第一个密钥" }
```

**响应 200：**

```json
{
  "key": { "id": "k_1", "name": "我的第一个密钥", "key": "sk-xxxxxx", "createdAt": "2026-01-02T08:00:00.000Z", "lastUsed": null }
}
```

### 10.3 DELETE `/api/api-keys/{id}` —— 删除密钥（必做）

**响应 200：** `{}`

---

## 11. 同步 / 探活 / 监控

### 11.1 GET `/api/sync?since=&store=` —— 增量同步（必做）

```http
GET /api/sync?since=2026-01-01T00:00:00.000Z&store=models
Authorization: Bearer <token>
```

- `since`：上次同步时间戳；`store`：要同步的存储名（`projects|characters|briefs|models|settings|portfolio`）。

**响应 200：** `{ "updates": [ ...变更记录 ], "version": 12 }`

### 11.2 GET `/api/health` —— 在线探活（强依赖，必做）

```http
GET /api/health
```

- 前端 `useBackendStatus.ts` / `useNetworkQuality.ts` 用它判断后端是否在线、测延迟。
- **返回 2xx = 在线**；**返回 404 = 离线**（前端据此显示「本地模式」徽标）。
- 不需要 body，返回 `200` 空响应即可（`HEAD` 请求也支持）。

### 11.3 POST `/api/{exception|message}` —— 监控上报（可选）

Sentry 兼容上报，仅前端配置了 DSN 才发。后端按监控方案实现即可，不影响业务。

---

## 12. SSE 事件流契约（后端就绪后启用）

前端 `shared/lib/sse.ts` 逐行解析 `data: <json>`，`[DONE]` 忽略。支持的事件：

| 接口 | 事件形状 |
|---|---|
| 角色对话 `POST /api/characters/{id}/chat` | `{ "type?": "...", "content": "逐字文本", "agent": "writer" }` |
| 项目生成 `POST /api/projects/{id}/generate` | `{ "type": "agent_switch"\|"chunk"\|"step_complete", "content": "...", "agent": "world" }` |
| seed 流式 `POST /api/projects/{id}/seed/stream` | `{ "type":"part", "part":"brief"\|"outline"\|"characters", "data": SeedBrief\|SeedOutline\|SeedCharacter[] }` / `{ "type":"done" }` |
| 工作流运行 `POST /api/workflows/{id}/run`（预留） | 同项目生成风格，后端自定义 |

**seed 流式 `data` 结构参考（§5.12 的 `data` 字段）：**
- `brief`：`{ genre, worldview, tone, forbidden, styleGuide, wordCountGoal?, dailyWordCountGoal?, sections?[] }`
- `outline`：`{ volumes:[ { id, title, chapters:[ { id, title, nodes:[ { id, title, content?, targetWords? } ] } ] } ] }`
- `characters`：`[ { id, name, description, role?, status?, currentProfile? } ]`

---

## 13. 后端必做优先级清单

### P0 — 强依赖，无兜底（缺失必报错 / 白屏 / 无法登录）
1. `POST /api/auth/login`、`POST /api/auth/refresh`（401 自动刷新强依赖）
2. `GET/POST/PUT/DELETE /api/projects` 及 `GET /api/projects/{id}`、`PUT /api/projects/{id}/steps/{stepId}`、`POST /api/projects/{id}/confirm`、`PUT /api/projects/{id}/brief`
3. `GET/POST /api/characters`、`GET/PUT/DELETE /api/characters/{id}`、`POST /api/characters/{id}/chat`（SSE）
4. `POST /api/generate/image`、`POST /api/video/generate`（生成强依赖，无回退）
5. `GET/POST/DELETE /api/api-keys`
6. `GET /api/health`（在线探活，否则前端判定离线、显示本地模式徽标）
7. `PUT /api/user/models`（密钥保管方，缺失则用户模型 apiKey 丢失、生成失败）
8. `POST /api/projects/{id}/generate`（SSE 正文生成，工作台核心）

### P1 — 有本地回退，但应实现以发挥完整能力
- `GET/PUT/POST/DELETE /api/workflows[/...]`（回退本地 IndexedDB）
- 知识库全部端点（回退本地向量检索 / 演示语料）
- `POST /api/projects/{id}/seed`（回退本地 mock）、`/summarize`、`/ai/transform`（回退本地变换）
- `GET /api/projects/{id}/portfolio`、`GET /api/generate/image/results`、`GET /api/video/tasks`（回退子接口/空）
- `POST /api/user/profile`、`POST /api/user/avatar`、`POST /api/auth/logout/register/verify-email`、`POST /api/user/change-password(-by-email)`
- `GET /api/sync`

### P2 — 可选 / 预留
- `POST /api/projects/{id}/seed/stream`（SSE，回退整包）
- `POST /api/workflows/{id}/run`（SSE，回退本地 DAG）
- `POST /api/{exception|message}`（监控上报）

---

## 14. 数据库字段（后端建表参考）

> 下表给出各实体**后端需要落库的字段**，类型用伪 SQL（`pk`=主键，`fk`=外键，`json`=JSON/JSONB，`ts`=时间戳）。直接对齐前端 `src/types/*`，保证 API 返回字段能从库里直接取。加密字段（密码、apiKey、密钥）务必服务端加密存储，前端看不到明文。
> 通用列：`id`(pk, string/uuid)、`createdAt`(ts)、`updatedAt`(ts) 多数表都有，下表不再重复标注。

### 14.0 持久化架构：检查点（权威）+ 自定义表（读优化）混合

后端基于 **LangGraph**，会话状态用两层存储：

1. **检查点 checkpointer（权威 / source of truth）**
   - 保存 LangGraph 运行时的完整线程状态（各节点中间值、`messages` 通道、断点），是 `resume(thread_id)` 的真相源。
   - 可用 `PostgresSaver`（与业务库同 PG 实例）或 LangGraph Platform 托管；前端不感知其内部。
   - `thread_id` 即 checkpointer 的线程主键，前端的 `thread_id` 与此一一对应。

2. **自定义表（读优化 / projection）**
   - 从 checkpointer 投影出的、面向 API 快速读取的业务数据：角色、项目、任务、以及下面的 `conversation_threads` / `thread_messages`。
   - API 的列表/详情响应直接查这些表，避免每次从 checkpointer 反序列化大状态。

> 分工口诀：**写/续跑找 checkpointer，读/列表找自定义表**。`thread_id` 是两层的关联键。

### 14.1 users（用户）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | pk string | 用户主键（对应 `User.id`） |
| username | string | 昵称（`User.username`） |
| email | string unique | 登录邮箱（`User.email`） |
| password_hash | string | 密码哈希（**绝不可存明文**） |
| avatar | string null | 头像 URL（`User.avatar`） |
| is_verified | bool | 邮箱是否已验证（`User.isVerified`） |
| refresh_token | string null | 刷新令牌（建议存 httpOnly cookie，也可落库） |

### 14.2 projects（项目）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | pk string | 项目主键（路径 `{id}`） |
| owner_id | fk → users.id | 所属用户（鉴权/隔离用） |
| title | string | 标题（`Project.title`，必填） |
| description | text null | 简介（`Project.description`） |
| genre | string null | 类型（`Project.genre`） |
| status | enum | `draft`/`generating`/`completed`/`paused`（`Project.status`） |
| pinned | bool | 是否置顶（`Project.pinned`，默认 false） |
| workflow_id | string null | 绑定流水线（`Project.workflowId`） |
| version | int | 乐观锁版本号（对应响应 `version`，`If-Match` 用） |

### 14.3 steps（项目正文步骤）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | pk string | 步骤主键（路径 `{stepId}`） |
| project_id | fk → projects.id | 所属项目 |
| agent | string | 节点/角色标识，如 `writer`（`Step.agent`） |
| agent_name | string null | 展示名，如「写作」（`Step.agentName`） |
| content | text | 正文内容（`Step.content`，必填） |
| status | string | 状态（`Step.status`） |
| node_id | string null | DAG 合并键（`Step.nodeId`） |
| order_idx | int | 排序（可选，前端目前用数组顺序） |

### 14.4 characters（角色）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | pk string | 角色主键（路径 `{id}`） |
| owner_id | fk → users.id | 所属用户 |
| project_id | string null | 所属项目（`Character.projectId`） |
| name | string | 姓名（`Character.name`，必填） |
| description | text | 描述（`Character.description`，必填） |
| avatar | string null | 头像 URL（`Character.avatar`） |
| aliases | json null | 别名数组（`Character.aliases`） |
| role | string null | 故事定位（`Character.role`） |
| status | string null | 当前状态（`Character.status`） |
| current_profile | text null | 当前时间点详情（`Character.currentProfile`） |
| custom_role | string null | 自定义定位（`Character.customRole`） |
| relationships | json null | 关系数组 `[{id,targetId,relation}]`（`Character.relationships`） |
| images | json null | 立绘图集（`Character.images`） |
| reference_images | json null | 一致性参考图（`Character.referenceImages`） |
| reference_image | string null | 单张参考图（`Character.referenceImage`） |
| image_seed | int null | 出图种子（`Character.imageSeed`） |

### 14.5 briefs（项目创作设定）

| 字段 | 类型 | 说明 |
|---|---|---|
| project_id | pk/fk → projects.id | 项目级设定，一对一 |
| genre | string null | 类型（`ProjectBrief.genre`） |
| worldview | text null | 世界观（`ProjectBrief.worldview`） |
| tone | string null | 基调/文风（`ProjectBrief.tone`） |
| forbidden | text null | 创作禁忌（`ProjectBrief.forbidden`） |
| style_guide | text null | 风格指南（`ProjectBrief.styleGuide`） |
| default_vision_model | string null | 默认视觉模型 id（`ProjectBrief.defaultVisionModel`） |
| default_style | string null | 默认图片风格（`ProjectBrief.defaultStyle`） |
| word_count_goal | int null | 总字数目标（`ProjectBrief.wordCountGoal`） |
| daily_word_count_goal | int null | 每日字数目标（`ProjectBrief.dailyWordCountGoal`） |
| sections | json null | 自定义维度 `[{id,title,content,pinned?,origin?}]`（`ProjectBrief.sections`） |
| field_origins | json null | 字段来源标记（`ProjectBrief.fieldOrigins`） |

### 14.6 user_models（用户模型配置）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | pk string | 模型主键 = 前端 `model_id`（生成请求携带） |
| owner_id | fk → users.id | 所属用户 |
| name | string | 名称（`ModelConfig.name`） |
| category | enum | `llm`/`vision`/`omni`/`speech`/`embedding` |
| deployment | enum | `cloud`/`local` |
| vendor | string | 厂商（`ModelConfig.vendor`） |
| adapter | string | 调用库标识（`ModelConfig.adapter`，如 openai/kling） |
| base_url | string null | 基址（`ModelConfig.baseUrl`） |
| api_key | string **加密** | 密钥明文**仅此处保管**，前端不留存（`ModelConfig.apiKey`） |
| model_id | string | 实际厂商模型名（`ModelConfig.modelId`） |
| is_default | bool | 是否默认（`ModelConfig.isDefault`） |
| modalities | json null | 能力 `[image,video]`（`ModelConfig.modalities`） |
| auxiliary | json null | 辅助模型数组（`ModelConfig.auxiliary`，仅 llm） |
| extra | json null | 额外参数表（`ModelConfig.extra`） |

> 这是**密钥唯一可信保管方**：前端 `PUT /api/user/models` 全量覆盖，`api_key` 在此加密存储；生成时后端凭 `model_id` 取出，绝不让前端传密钥。

### 14.7 media_tasks（图片/视频生成任务）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | pk string | 任务主键（`MediaTask.id`） |
| owner_id | fk → users.id | 所属用户 |
| kind | enum | `image`/`video`（`MediaTask.kind`） |
| prompt | text | 提示词（`MediaTask.prompt`，必填） |
| status | enum | `pending`/`processing`/`completed`/`failed`（`MediaTask.status`） |
| progress | float null | 进度 0~100（`MediaTask.progress`） |
| result_url | string null | 成品 URL（`MediaTask.result_url`） |
| project_id | string null | 所属项目（`MediaTask.project_id`） |
| source | enum null | `character`/`chapter`（`MediaTask.source`） |
| source_ref | string null | 来源引用（`MediaTask.source_ref`） |
| chapter_id | string null | 关联章节（`MediaTask.chapter_id`，视频用） |
| character_ids | json null | 关联角色（`MediaTask.character_ids`） |
| storyboard | text null | 分镜脚本（`MediaTask.storyboard`） |

### 14.8 workflows（创作流水线）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | pk string | 流水线主键（路径 `{id}`） |
| owner_id | fk → users.id | 所属用户（内置流水线可 owner 为空/系统） |
| name | string | 名称（`Workflow.name`） |
| description | text null | 描述（`Workflow.description`） |
| builtin | bool | 是否内置（`Workflow.builtin`，内置不可删） |
| nodes | json | 节点数组 `[{id,kind,label,modelId?,systemPrompt?,roleId?,tier?,dependsOn?}]` |
| edges | json | 连线数组 `[{from,to}]` |

### 14.9 knowledge_docs（知识库文档）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | pk string | 文档主键（`KbDocMeta.id`） |
| name | string | 文件名（`KbDocMeta.name`） |
| status | enum | `indexing`/`indexed`/`failed`（`KbDocMeta.status`） |
| scope | enum | `personal`/`public`（`KbDocMeta.scope`） |
| uploader_id | string null | 上传者（`KbDocMeta.uploaderId`） |
| uploader_name | string null | 上传者名（`KbDocMeta.uploaderName`） |
| content | text null | 正文（个人库本地为主；公共库服务端存，`KbDocMeta.content`） |
| vector_status | enum null | 向量索引状态（可选，配合 pgvector） |

> 公共库检索走 `pgvector`；个人库默认端侧向量检索不依赖后端，仅上传/列表/删除需落库。

### 14.10 api_keys（开放平台密钥）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | pk string | 密钥主键（`ApiKey.id`） |
| owner_id | fk → users.id | 所属用户 |
| name | string | 名称（`ApiKey.name`） |
| key_hash | string **加密** | 密钥哈希（**不要存明文**，展示用一次性返回后丢弃） |
| last_used | ts null | 最近使用时间（`ApiKey.lastUsed`） |

### 14.11 sync_state（增量同步，可选）

| 字段 | 类型 | 说明 |
|---|---|---|
| id | pk string | 同步记录主键 |
| owner_id | fk → users.id | 所属用户 |
| store | enum | `projects`/`characters`/`briefs`/`models`/`settings`/`portfolio` |
| version | int | 当前版本号（对应 `/api/sync` 的 `version`） |
| payload | json | 变更数据（`updates` 数组元素） |
| updated_at | ts | 变更时间（对应 `since` 过滤） |

### 14.12 conversation_threads（线程索引，读优化）

LangGraph checkpointer 存的是「状态」，不方便按业务维度列表/检索。本表是 **thread 的读优化索引**，把 `thread_id` 与业务实体关联起来，供 GET 历史、会话列表、续聊定位使用。

| 字段 | 类型 | 说明 |
|---|---|---|
| thread_id | pk string | **与 LangGraph checkpointer 的 thread_id 完全一致**（即接口返回的 `thread_id`） |
| owner_id | fk → users.id | 所属用户 |
| entity_type | enum | `character` / `project` / `seed` / `workflow` |
| entity_id | string | 业务实体 id（如 character id、project id） |
| project_id | string null | 关联项目（角色对话按「角色+项目」分会话时填） |
| title | string null | 会话展示名（可选） |
| checkpoint_backend | string null | 检查点后端标识（如 `postgres` / `memory`），便于排查 |
| last_active_at | ts | 最近活跃时间（续聊排序用） |

> 创建时机：后端首次生成 `thread_id` 时，同时写本表一行；`thread_id` 必须与 checkpointer 端一致。

### 14.13 thread_messages（消息历史投影，读优化）

`GET /api/characters/{id}/messages?thread_id=` 的历史来源。可由 checkpointer 的 `messages` 通道异步投影而来，或直接落库（每次 assistant/user 产出时写一行），让历史读取走这张表而非反序列化 checkpoint 大状态。

| 字段 | 类型 | 说明 |
|---|---|---|
| id | pk string | 消息主键（`Message.id`） |
| thread_id | fk → conversation_threads.thread_id | 所属线程 |
| role | enum | `user` / `assistant`（`Message.role`） |
| content | text | 消息内容（`Message.content`） |
| seq | int | 同线程内顺序（保证历史顺序） |
| created_at | ts | 消息时间 |

> 与 §1.8 的混合架构一致：**短期记忆（进行中的对话状态）= checkpointer 权威；长期历史 = 本表读优化**。续聊时后端优先用 checkpointer resume，无需前端再传整段 `messages`。

---

## 15. 后端实现约束（来自前端契约）

- 响应结构须与 `openapi/seed-api.yaml` 一致（列表为 `{projects/characters/workflows/documents/keys: []}`，单资源为 `{project/character/workflow/task: {...}}`）。
- 未就绪的占位响应务必带 `mocked: true` 字段，前端据此回退本地（见 `workflowStorage.ts`、`knowledge.ts`）。
- 生成类请求体以 `model_id`（用户模型主键）传参，后端凭 id 查 `adapter/baseUrl/apiKey/category/tier`，**不要**要求前端直传 apiKey。
- 并发写支持 `If-Match`（乐观锁）与 `Idempotency-Key`（幂等）。
- 图片/视频 `result_url` 域名须加入 `next.config.ts` 的 `remotePatterns` 白名单（amazonaws / cloudfront / googleusercontent 已含），否则 `next/image` 拒绝加载。

---

### 附录： GenerationContext（生成上下文，§7 的 `context` 字段）

```ts
interface GenerationContext {
  project_id?: string;
  project_title?: string;
  summary?: string;
  plot_summary?: string;
  characters?: { name; role?; description; currentProfile?; status; change?; relationships?: {target;relation}[] }[];
  outline?: string;
  outlineTree?: unknown[];
  sections?: { title; content }[];
  source?: 'character' | 'chapter';
  source_ref?: string;
  brief?: string;
  rag_chunks?: unknown[];
}
```

> 后端可整包透传给 LangGraph 子图，无需反解文本；前端也把它折叠成「项目设定基座」文本注入根节点。
