# TextForge API 说明文档

本文档描述 TextForge 后端（`text_forge_backend`，FastAPI）提供的全部 HTTP 接口与实时通信协议。

## 目录

- [1. 总览](#1-总览)
- [2. 通用约定](#2-通用约定)
- [3. 认证 Auth](#3-认证-auth)
- [4. 用户 User](#4-用户-user)
- [5. Agent 协作](#5-agent-协作)
- [6. 书籍 Book](#6-书籍-book)
- [7. 卷 / 章 / 正文 / 创意设定](#7-卷--章--正文--创意设定)
- [8. 角色 Character](#8-角色-character)
- [9. 世界构建 World](#9-世界构建-world)
- [10. 知识库 Knowledge](#10-知识库-knowledge)
- [11. Agent 记忆](#11-agent-记忆)
- [12. 工作流 Workflow](#12-工作流-workflow)
- [13. 模型 Model](#13-模型-model)
- [14. 创作向导 Wizard](#14-创作向导-wizard)
- [15. 写作会话 Writing Session](#15-写作会话-writing-session)
- [16. 模拟房间 SimRoom（WebSocket）](#16-模拟房间-simroomwebsocket)
- [17. 剧情流 StoryFlow（SSE）](#17-剧情流-storyflow-sse)
- [18. 系统 System](#18-系统-system)

---

## 1. 总览

- **Base URL**：所有接口挂在 `/api` 前缀下，如 `POST /api/auth/login`。
- **协议**：REST（JSON）+ SSE（Agent/向导/剧情流）+ WebSocket（SimRoom）。
- **鉴权方式**：除明确标注「公开」的端点外，均需请求头 `Authorization: Bearer <access_token>`。
- **令牌体系**：`access_token`（默认 15 分钟，JWT，由登录/刷新接口返回）由前端内存持有；`refresh_token`（默认 7 天）由后端通过 **HttpOnly Cookie `tf_rt`** 下发，前端 JS 不可读，通过 `/api/auth/refresh` 换取新 access token。

---

## 2. 通用约定

### 2.1 统一错误结构

```json
{
  "detail": "可读的中文错误描述",
  "error_code": "机器可读错误码（可选）",
  "hint": "用户可自助的处理建议（可选）"
}
```

- 业务异常（`AppException`）与可自助错误（密钥无效/额度不足/网络超时/上下文过长/文件问题）返回具体中文提示；
- 未捕获异常只返回通用文案「服务器开小差了，请稍后重试」，内部细节仅记录日志；
- 参数校验失败（422）时 `detail` 为数组：`[{"loc": [...], "msg": "..."}]`。

### 2.2 分页响应格式（`PageResult`）

```json
{
  "items": [],
  "total": 0,
  "page": 1,
  "page_size": 20,
  "total_pages": 1,
  "has_next": false,
  "has_prev": false
}
```

分页查询参数一般为 `page` / `page_size`（或部分接口 `limit` / `offset`，见各接口说明）。

### 2.3 限流（Redis 固定窗口，按用户）

| 接口 | 限额 |
|---|---|
| `POST /agent/stream`、`POST /agent/compress` | 5 次/分钟 |
| `POST /agent/review-action` | 30 次/分钟 |
| `POST /agent/start` | 10 次/分钟 |
| `GET /books/{id}/export` | 5 次/分钟 |
| `POST /models/proxy/*`（无鉴权，按 IP） | 120 次/分钟 |
| 登录（按邮箱） | 15 分钟内失败 10 次锁定 |

Redis 不可用时限流自动降级放行。

### 2.4 公共端点（无需鉴权）

| 端点 | 说明 |
|---|---|
| `GET /` | 根路径（`{"Hello":"World"}`） |
| `GET /api/health`、`/api/health/live`、`/api/health/ready` | 健康检查 |
| `POST /api/auth/register`、`/verify-email`、`/login`、`/resend-verify`、`/refresh`、`/logout` | 认证系列 |
| `GET /api/models/proxy/{path}` | 模型权重代理（仓库/文件白名单 + IP 限流） |

---

## 3. 认证 Auth

### 3.1 注册

`POST /api/auth/register`

```json
{ "user_name": "张三", "password": "******", "email": "zhangsan@example.com" }
```

响应：`200`，注册成功即发送验证邮件，`{"email_sent": true}`。用户需通过邮箱验证码完成验证后才能登录。

### 3.2 邮箱验证

`POST /api/auth/verify-email`

```json
{ "email": "zhangsan@example.com", "code": "123456" }
```

响应：`{"message": "..."}`；验证码错误/过期返回 `400`。

### 3.3 登录

`POST /api/auth/login`

```json
{ "email": "zhangsan@example.com", "password": "******" }
```

响应：`200`

```json
{
  "access_token": "<jwt>",
  "user": { "id": 1, "user_name": "张三", "email": "zhangsan@example.com", "avatar": null }
}
```

同时通过 `Set-Cookie: tf_rt=...; HttpOnly; Path=/` 下发 refresh token。失败响应统一 `401`（文案不区分「邮箱不存在」与「密码错误」，防止账号枚举；未验证邮箱仅通过 `error_code` 区分）。

### 3.4 重发验证邮件

`POST /api/auth/resend-verify` `{ "email": "..." }` —— 仅已注册但未验证的邮箱可重发。

### 3.5 刷新令牌

`POST /api/auth/refresh` —— refresh token 自动取自 `tf_rt` Cookie（也可放请求体）。响应：`{"access_token": "<jwt>", "user": {...}}`。

### 3.6 登出

`POST /api/auth/logout` —— 将当前 access token 的 `jti` 加入 Redis 黑名单并清除 Cookie。请求体可选携带 `access_token` / `refresh_token`。

---

## 4. 用户 User

以下接口均需鉴权。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/user/profile` | 获取当前用户资料 |
| PUT | `/api/user/profile` | 修改用户名/邮箱（改邮箱需先获取该邮箱验证码） |
| POST | `/api/user/change-password` | 旧密码改密 `{"old_password","new_password"}`；改密后 `auth:pwd_ver` 递增，所有旧 token 立即失效 |
| POST | `/api/user/change-password-by-email` | 邮箱验证码改密 `{"email","code","new_password"}` |
| POST | `/api/user/send-code` | 发送改邮箱验证码 `{"email"}`（校验邮箱未被占用 + 限流） |
| POST | `/api/user/avatar` | 上传头像（multipart，`file` 字段），返回头像 URL |
| DELETE | `/api/user/account` | 注销账号 `{"password"}`；校验密码后级联删除全部数据、清 refresh token、删头像文件 |

---

## 5. Agent 协作

Agent 域是核心创作链路。会话基于 LangGraph 检查点（PostgreSQL）持久化。

### 5.1 会话管理

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/agent/conversations?book_id=` | 当前用户会话列表 |
| GET | `/api/agent/conversations/{conv_id}/messages?limit=&offset=` | 分页取消息（倒序取后恢复正序） |
| DELETE | `/api/agent/conversations/{conv_id}` | 删除会话（级联删除消息） |
| PATCH | `/api/agent/conversations/{conv_id}` | 重命名会话 `{"title"}` |
| POST | `/api/agent/start?book_id=` | 新建会话，返回 `{"thread_id": "...", "conversation": {...}}`（限流 10/分钟） |

### 5.2 书籍锁

Agent 写章节时使用书籍级互斥锁（Redis，带心跳续期），防止多线程并发写坏手稿。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/agent/book-lock?book_id=` | 查锁状态（holder / ttl） |
| DELETE | `/api/agent/book-lock?book_id=` | 强制释放锁（仅书籍所有者） |

### 5.3 流式对话（主链路，SSE）

`POST /api/agent/stream/{thread_id}`

请求体（要点）：

```json
{
  "content": "帮我写第一章的初稿",
  "message_id": "前端生成的消息 id（幂等/防重发）",
  "mode": "chat | worldbuilding | outlining | drafting | revising"
}
```

#### SSE 事件

| 事件 | 载荷要点 | 说明 |
|---|---|---|
| `keepalive` | `{}` | 心跳（空闲时周期性发送） |
| `node_start` | `{node_id, label}` | 子图节点开始 |
| `node_stream` | `{node_id, delta}` | 节点流式增量文本 |
| `think_start` / `agent_reasoning` | `{...}` | 思考阶段开始 / 推理内容 |
| `agent_token` | `{token}` | 最终回复 token 增量 |
| `progress` | `{node, progress}` | 进度条 |
| `tool_start` / `tool_end` | `{tool_name, args / result}` | 工具调用开始/结束 |
| `review_card` | `{card}` | 质量审核卡（Agent 写操作需人工决策） |
| `suggestions` | `{items}` | 下一步建议 |
| `turn_metrics` | `{metrics}` | 回合指标 |
| `end` | `{reply, message_id}` | 回合结束（含最终回复正文） |
| `error` | `{message, error_code}` | 错误 |

并发与生命周期：同一线程同时仅允许一个流；书籍锁互斥（被占用返回 `503`，前端提供「解锁并重试」）；空闲超时自动结束；进程关闭时取消在途任务。

### 5.4 取消流式

`POST /api/agent/stream/{thread_id}/cancel` —— 取消在途流式任务并清理 pending 状态。

### 5.5 压缩上下文

`POST /api/agent/compress`（SSE）—— 将历史对话生成摘要存入 AgentMemory 并裁剪 checkpoint，释放上下文（限流 5/分钟）。

### 5.6 审核卡决策

`POST /api/agent/review-action`

```json
{
  "thread_id": "...",
  "action": "accept | edit | retry | terminate",
  "edited_content": "action=edit 时提供修改后内容",
  "reason": "决策理由（写审计）"
}
```

决策结果写入 `agent_write_audits` 审计表（限流 30/分钟）。

### 5.7 审计与指标

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/agent/audits?book_id=&limit=` | 写操作审计记录 |
| GET | `/api/agent/turn-metrics?book_id=&limit=` | 回合指标记录 |

### 5.8 非流式回合（预留）

`POST /api/agent/respond` —— 非流式回复（内部/测试用途，与流式互斥）。

---

## 6. 书籍 Book

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/books?genre=` | 书籍列表 |
| POST | `/api/books` | 创建书籍 `{"title","description","genre",...}` |
| GET | `/api/books/{id}` | 书籍详情（含角色列表） |
| PUT | `/api/books/{id}` | 全量更新 |
| PATCH | `/api/books/{id}` | 局部更新（推荐；避免误清 workflow 绑定） |
| DELETE | `/api/books/{id}` | 删除书籍（级联删除卷/章/正文/角色/世界/记忆等） |
| GET | `/api/books/{id}/characters` | 书籍角色列表 |
| GET | `/api/books/{id}/volumes` | 卷树 |
| GET | `/api/books/{id}/chapters` | 卷 → 章树 |
| GET | `/api/books/{id}/outline-tree` | 大纲树（卷/章/场景事件） |
| PATCH | `/api/books/{id}/chapters/{chapter_id}/lock` | 章节锁定切换 |
| GET | `/api/books/{id}/context-config` | 上下文配置（角色 ID 列表） |
| PUT | `/api/books/{id}/context-config` | 保存上下文配置 |
| GET | `/api/books/{book_id}/export?fmt=md\|txt\|epub\|pdf&include_outline=&include_characters=&volume_ids=` | 导出书籍（限流 5/分钟） |

---

## 7. 卷 / 章 / 正文 / 创意设定

### 卷

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/volumes/books/{book_id}` | 列卷 |
| POST | `/api/volumes/books/{book_id}` | 建卷 `{"title","summary","sort_order"}` |
| PUT | `/api/volumes/{volume_id}` | 改卷 |
| DELETE | `/api/volumes/{volume_id}` | 删卷（级联删章） |

### 章

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/chapters/volumes/{volume_id}` | 列章 |
| POST | `/api/chapters/volumes/{volume_id}` | 建章 |
| PUT | `/api/chapters/{chapter_id}` | 改章（标题/摘要/sort_order/锁定） |
| DELETE | `/api/chapters/{chapter_id}` | 删章 |

### 正文

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/chapter-contents/chapters/{chapter_id}` | 正文版本列表 |
| GET | `/api/chapter-contents/chapters/{chapter_id}/latest` | 最新版本正文 |
| POST | `/api/chapter-contents/chapters/{chapter_id}` | 新增正文版本 `{"content"}`；章节已锁定返回 `409` |
| GET | `/api/chapter-contents/chapters/{chapter_id}/diff?from_version=&to_version=` | 两个版本间的 diff |

### 创意设定

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/creative-settings/books/{book_id}` | 创意设定（tone 文风 / worldview 世界观 / writing_taboos 禁忌 / custom_dimensions 自定义维度 / locked） |
| PUT | `/api/creative-settings/books/{book_id}` | 更新创意设定 |

---

## 8. 角色 Character

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/characters?book_id=` | 角色列表 |
| POST | `/api/characters` | 建角色（必填：name、description、role_type、status；可选 aliases、relationship_chain、custom_fields、spawn/base_location_id） |
| GET | `/api/characters/{id}` | 角色详情 |
| PUT | `/api/characters/{id}` | 更新角色 |
| DELETE | `/api/characters/{id}` | 删除角色 |
| GET | `/api/characters/{id}/avatar` | 获取头像 URL |
| POST | `/api/characters/{id}/avatar` | 上传头像（multipart） |
| DELETE | `/api/characters/{id}/avatar` | 删除头像 |

---

## 9. 世界构建 World

地点（locations）、时间线事件（timeline-events）、伏笔（foreshadowings）、情节线（plot-threads）四类实体提供统一 CRUD 模式（路径前缀 `/api/world`，均校验书籍归属）：

| 实体 | 列表（分页） | 创建 | 更新 | 删除 |
|---|---|---|---|---|
| 地点 | `GET /api/world/locations?book_id=` | `POST /api/world/locations` | `PUT /api/world/locations/{id}` | `DELETE /api/world/locations/{id}` |
| 时间线事件 | `GET /api/world/timeline-events?book_id=` | `POST /api/world/timeline-events` | `PUT /api/world/timeline-events/{id}` | `DELETE /api/world/timeline-events/{id}` |
| 伏笔 | `GET /api/world/foreshadowings?book_id=` | `POST /api/world/foreshadowings` | `PUT /api/world/foreshadowings/{id}` | `DELETE /api/world/foreshadowings/{id}` |
| 情节线 | `GET /api/world/plot-threads?book_id=` | `POST /api/world/plot-threads` | `PUT /api/world/plot-threads/{id}` | `DELETE /api/world/plot-threads/{id}` |

> 场景事件（scene_events）由书籍接口（outline-tree 等）携带返回；事件数据仅包含本场景关联角色及其直属链，不无限追链。

---

## 10. 知识库 Knowledge

> 公共库仅支持列表/下载/上传/删除，**不做前端向量搜索**；向量检索由后端 Agent 在生成时发起。

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/knowledge/upload` | 上传公共文档（multipart：`file` + `embedding` 配置 JSON）。支持 TXT/MD/JSON/CSV，≤10MB；embedding 配置缺失/为空时自动降级全文检索 |
| GET | `/api/knowledge/public?page=&page_size=` | 公共文档列表（分页，含作者信息） |
| GET | `/api/knowledge/public/{doc_id}` | 文档全文（按 chunk 顺序拼接） |
| DELETE | `/api/knowledge/{doc_id}` | 删除文档（**仅作者本人**，前端按 uploaderId 隐藏删除入口） |

---

## 11. Agent 记忆

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/agent-memories/?book_id=&memory_type=&page=` | 分页列表 |
| POST | `/api/agent-memories/` | 创建记忆（可选携带 embedding 配置；缺失则回退全文） |
| PUT | `/api/agent-memories/{memory_id}` | 更新记忆 |
| DELETE | `/api/agent-memories/{memory_id}` | 删除记忆 |
| POST | `/api/agent-memories/search` | 检索记忆：`{"query","mode":"fulltext\|vector","top_k"}`；未配置 embedding 时 vector 模式自动降级 fulltext |

---

## 12. 工作流 Workflow

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/workflows/` | 工作流列表（含内置） |
| POST | `/api/workflows/` | 创建工作流 `{"name","description","nodes","edges"}`（自动生成 id） |
| GET | `/api/workflows/{id}` | 工作流详情 |
| PUT | `/api/workflows/{id}` | 保存工作流（nodes/edges） |
| DELETE | `/api/workflows/{id}` | 删除工作流（删除后不会复活） |
| POST | `/api/workflows/run` | **SSE 直接执行工作流**（确定性执行，不走 Agent LLM；内部/测试用途，前端经 `/agent/stream` 走 Agent 子图） |

工作流节点结构：`id`、`type`（角色节点）、`data`（模型配置、层级 main/audit/tool/router 执行器元信息）、`position`；边为 `{source, target, ...}`。

---

## 13. 模型 Model

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/models/test` | 需鉴权 | 测试模型连通性 `{"adapter","model_id","api_key","base_url"}`；SSRF 防护（仅允许公网 URL） |
| GET | `/api/models/proxy/{path}` | **无鉴权** | 流式代理 HuggingFace 模型权重（供浏览器 transformers.js 下载 embedding 模型，白名单仓库/后缀 + 国内镜像容灾 + IP 限流 120/min） |

---

## 14. 创作向导 Wizard

`POST /api/wizard/stream-generate`（SSE，需鉴权）—— 按 Step 0–6 流式生成完整创作方案（世界观 → 地点 → 角色 → 情节线 → 大纲 → 事件 → 伏笔），输出 Markdown。

| SSE 事件 | 载荷 | 说明 |
|---|---|---|
| `meta` | `{step, title}` | 方案步骤元信息 |
| `delta` | `{delta}` | Markdown 增量文本 |
| `volume_end` | `{...}` | 某个步骤/卷完成 |
| `done` | `{...}` | 全部完成 |
| `error` | `{message}` | 错误 |

---

## 15. 写作会话 Writing Session

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/writing-sessions/` | 创建写作会话 `{"book_id","chapter_id","character_ids",...}` |
| PUT | `/api/writing-sessions/{session_id}/end` | 结束会话（结算字数/时长） |
| GET | `/api/writing-sessions/` | 分页列表 |
| GET | `/api/writing-sessions/{session_id}` | 详情 |
| DELETE | `/api/writing-sessions/{session_id}` | 删除 |
| GET | `/api/writing-sessions/statistics/summary` | 统计汇总 |
| GET | `/api/writing-sessions/statistics/writing-trend` | 写作趋势 |
| GET | `/api/writing-sessions/statistics/character-frequency` | 角色出场频率 |
| GET | `/api/writing-sessions/statistics/plot-progress` | 情节推进 |

---

## 16. 模拟房间 SimRoom（WebSocket）

### 16.1 REST 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/sim-rooms/?bookId=&page=` | 房间列表（分页） |
| POST | `/api/sim-rooms/` | 创建房间（选定参与者角色、导演/用户角色等） |
| GET | `/api/sim-rooms/{room_id}` | 房间详情（参与者/消息/支线） |
| DELETE | `/api/sim-rooms/{room_id}` | 删除房间（级联清理沉淀记忆） |

### 16.2 WebSocket

`WS /api/sim-rooms/{room_id}/ws`

- **连接鉴权**：access token 通过 `Sec-WebSocket-Protocol` 子协议传递（不放 query，防日志泄露）。
- **首帧**：客户端发送 `{"type":"config","modelConfig":{...}}` 确认模型配置；服务端回 `{"type":"connected","userRoleLabel":...}`。

#### 客户端 → 服务端

| 消息 | 载荷 | 说明 |
|---|---|---|
| `config` | `{modelConfig}` | 首帧确认 |
| `chat` | `{content, speakAs: "director" \| "character:<id>"}` | 发言（speakAs 已归一化） |
| `auto_advance` | `{turns}` | 导演自动驱动多轮 |
| `branch` | `{branchType}` | 创建支线（backstory / relationship / plot-thread / ...） |
| `end` | `{generateSummary}` | 结束并生成摘要 |

#### 服务端 → 客户端

| 事件 | 载荷 | 说明 |
|---|---|---|
| `connected` | `{userRoleLabel}` | 连接成功 |
| `stream_start` | `{...}` | 回合开始 |
| `stream_token` | `{token, senderLabel}` | token 增量（同一回合累积） |
| `turn_done` | `{roundCount}` | 回合定稿 |
| `auto_end` / `end` | `{reason, summary, roundCount}` | 自动/手动结束 |
| `branch_created` | `{branch}` | 支线沉淀完成 |
| `suggestions` | `{items}` | 建议（取前 2 条） |
| `heartbeat` | `{}` | 心跳 |
| `error` | `{message}` | 错误 |

客户端需实现指数退避重连（1s→10s）与断线回滚：未收到 `turn_done`/`end` 的流式片段视为未定稿，重连后通过 `GET /api/sim-rooms/{room_id}` 重新对齐历史。

---

## 17. 剧情流 StoryFlow（SSE）

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/story-flows/` | 创建剧情流并 **SSE 流式生成首场景** |
| POST | `/api/story-flows/{flow_id}/advance` | SSE 推进剧情（携带 `chosen_option`；乐观锁 `nodeSeq` 防并发，冲突返回 `409`，前端自动重建） |
| POST | `/api/story-flows/{flow_id}/complete` | 结束并生成摘要 |
| GET | `/api/story-flows/{flow_id}` | 会话 + 节点 |
| GET | `/api/story-flows/?bookId=&chapterId=&status=` | 列表 |
| PATCH | `/api/story-flows/{flow_id}` | 修改视角角色 |
| DELETE | `/api/story-flows/{flow_id}` | 删除 |

SSE 事件：`scene_stream`（场景文本增量）、`scene_done`、`done`、`error`。限制：自由推演最多 30 幕；流式进行中禁止重复发起。

---

## 18. 系统 System

### 18.1 健康检查（公开）

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/health` | 总览 |
| GET | `/api/health/live` | liveness（进程存活） |
| GET | `/api/health/ready` | readiness（数据库/Redis 就绪） |

### 18.2 增量同步

`GET /api/sync?since=<ISO时间>&store=<store>`（需鉴权）—— 返回指定时间戳之后变更的数据，`store` 可选：`books` / `characters` / `creative-settings` / `world` / `manuscript` / `writing-sessions`。

### 18.3 实体锁定

`POST /api/lock/{entity_type}/{entity_id}`（需鉴权）—— 锁定/解锁实体。`entity_type` 可为 `characters` / `locations` / `foreshadowings` / `plot_threads` / `scene_events` / `creative_settings`。锁定期间他人不可修改；Agent 写作修改内容实体（如创意设定）受同一锁保护。

---

## 附录 A：Agent SSE 事件时序（一次完整回合）

```
POST /api/agent/stream/{thread_id}
──► keepalive*（空闲心跳）
──► node_start（guardrail 校验）
──► think_start ─► agent_reasoning*（思考）
──► node_start（drafting 子图）
──► tool_start（如 read_chapter）──► tool_end
──► review_card（写操作需人工决策）
──► agent_token*（最终回复流式输出）
──► suggestions ─► turn_metrics
──► end {reply, message_id}
```

## 附录 B：鉴权流程图

```
登录 ──► access_token（内存） + tf_rt Cookie（HttpOnly）
  │
  ├─ 正常请求：Authorization: Bearer <access_token>
  ├─ 401 ──► POST /api/auth/refresh（Cookie 自动携带）──► 新 access_token 重试一次
  └─ 改密后：旧 token 全部失效（Redis pwd_ver 版本号）
```
