# TextForge 架构设计文档

本文档描述 TextForge 的整体架构与关键设计决策，面向想要理解或修改本项目的开发者。接口级细节见 [API.md](API.md)，运行与部署见 [DEPLOY.md](DEPLOY.md)。

## 目录

- [1. 系统总览](#1-系统总览)
- [2. 后端分层架构](#2-后端分层架构)
- [3. 认证与令牌生命周期](#3-认证与令牌生命周期)
- [4. Agent 图编排（核心链路）](#4-agent-图编排核心链路)
- [5. 质量把关与审核卡](#5-质量把关与审核卡)
- [6. 上下文管理](#6-上下文管理)
- [7. 并发控制](#7-并发控制)
- [8. 实时通信设计](#8-实时通信设计)
- [9. 前端架构](#9-前端架构)
- [10. 数据模型设计](#10-数据模型设计)
- [11. 关键设计决策](#11-关键设计决策)

---

## 1. 系统总览

TextForge 是一个前后端分离的应用：前端为 Next.js SPA（客户端状态驱动），后端为 FastAPI 服务，基础设施为 PostgreSQL（pgvector）与 Redis。

```
┌────────────┐   /api (rewrites 或 Nginx)   ┌──────────────────┐
│ 浏览器 SPA  │ ───────────────────────────► │  FastAPI :8000    │
│ Next.js 16 │     SSE / WebSocket          │  domains/* 业务域  │
└────────────┘                              └───┬──────┬───────┘
                                                │ SQL  │ Redis
                                                ▼      ▼
                                     ┌────────────────────────┐
                                     │ PostgreSQL (pgvector)  │
                                     │ + Redis                │
                                     └────────────────────────┘
```

- **前端**：Next.js App Router 纯客户端渲染，全部业务状态位于 zustand store；开发期由 `next.config.ts` rewrites 把 `/api`、`/static` 代理到后端。
- **后端**：`main.py` 装配应用，所有 router 统一挂 `/api` 前缀；启动时自动建表 + 存量增量迁移 + 种子内置工作流 + 初始化 LangGraph 检查点连接池。
- **基础设施**：PostgreSQL 承担业务数据与 Agent 检查点（双 URL 连接），Redis 承担限流、令牌黑名单、RAG 缓存、并发锁。

## 2. 后端分层架构

```
domains/<业务域>/
├── router.py        HTTP 边界：参数校验（Pydantic）、鉴权依赖、归属校验（_owner_check）
├── service.py       业务逻辑、事务编排、跨域协作
└── repository.py    数据访问，继承 shared/base_repo.py 的 BaseRepository[T]
```

- **按域划分**：`auth / user / book / world / agent / workflow / knowledge / memory / wizard / sim_rooms / story_flow / writing_session / model / lock / system / common` 十六个业务域，每个域自包含 router → service → repository 三层。
- **横切关注点下沉 `core/` 与 `shared/`**：
  - `core/`：auth 依赖（JWT 校验）、security（密码/JWT 工具）、errors/exceptions（统一错误分类）、llm_retry（指数退避）、model_factory（按用户配置构建模型实例）；
  - `shared/`：database（异步引擎池）、graph_store（LangGraph 检查点池）、redis（缓存封装）、lock_guard（实体锁）、ratelimit（Redis 固定窗口）、pagination、base_repo、utils（SSRF 防护、日志脱敏）。
- **数据访问约定**：仓库默认不自动 commit，由 service 层统一开启事务，保证「改一处不落一半」的原子性。

## 3. 认证与令牌生命周期

双 token 体系，兼顾安全与体验：

```
┌─────────┐  POST /auth/login
│  前端    │ ─────────────────────► access_token（15min，JWT，内存态）
│ (内存)   │ ◄───────────────────── Set-Cookie: tf_rt（7d，HttpOnly）
└─────────┘
    │ 401
    ▼
POST /auth/refresh（Cookie 自动携带）──► 新 access_token，重试原请求一次
```

设计要点：

- **access token 内存态**：仅存 zustand，不落任何持久化；刷新令牌 HttpOnly Cookie，JS 不可读，XSS 无法窃取；
- **单飞刷新**：并发 401 只触发一次 `/auth/refresh`（`refreshInFlight` 去重），其余请求等待同一 Promise；
- **黑名单与版本号**：登出将 access `jti` 写入 Redis 黑名单；改密递增 Redis 中 `auth:pwd_ver:{user_id}`，使旧 token 全部失效——两条撤销路径覆盖了「主动登出」与「凭证泄露」两类场景；
- **防枚举**：登录失败统一 `401` 文案，未验证邮箱仅通过 `error_code` 区分；按邮箱限流 15 分钟 10 次；
- **认证恢复**：页面刷新后由登录标志 + refresh cookie 静默换取新 access token，`waitForHydration()` 保证首请求不裸奔。

## 4. Agent 图编排（核心链路）

### 4.1 图结构：扁平父图 + 嵌套编译子图

```
                        ┌──────────────┐
  用户消息 ────────────► │  guardrail   │ 输入校验 / 上下文组装
                        └──────┬───────┘
                               ▼
                        ┌──────────────┐
                        │  supervisor  │ 意图路由（含 Agent 记忆检索）
                        └──────┬───────┘
              ┌───────────────┼─────────────────┐
              ▼               ▼                 ▼
    ┌────────────────┐ ┌────────────┐ ┌────────────────┐
    │ worldbuilding  │ │ outlining  │ │ drafting       │
    │ (编译子图)      │ │ (编译子图)  │ │ revising       │
    │                │ │            │ │ (chat 直接回复) │
    └────────────────┘ └────────────┘ └────────────────┘
              │               │                 │
              └───────────────┴────────┬────────┘
                                       ▼
                                ┌──────────────┐
                                │     sync     │ 合并指标 / 裁剪消息 / 落库
                                └──────┬───────┘
                                       ▼
                                      END
```

- 四个创作子图均为 `StateGraph` 编译图，作为父图的节点嵌入（`build_subgraph() 返回 b.compile(name=...)`）；
- **为什么嵌套编译子图而非扁平单图**：子图天然隔离各域的 prompt 与工具集（符合「按域派发任务、不炸上下文」的约束）；langgraph 1.2.9 下父图 `astream` 必须开启 `subgraphs=True` 才能收到子图内 custom events（流式事件回归的根因）。

### 4.2 子图内部拓扑

```
START → entry_router → agent_call / tool_calls / workflow_runner
                     → agent_router → quality_gate_router
                     → (compress / agent_call / final) / workflow_runner → final → END
```

- `entry_router`：判断本回合是否需要工具调用 / 工作流执行 / 直接回答；
- `gated_tool_node`：写操作工具（如 `write_chapter_content`）生成 `review_card` 挂起等待人工决策，读操作工具直接执行；
- `workflow_runner_node`：执行用户自定义工作流节点并写入审计；
- `sync_node`：合并子图指标、裁剪消息历史。

### 4.3 检查点与续作

- 检查点存 PostgreSQL（`AsyncPostgresSaver`，连接池 min 3 / max 5），`thread_id` 即会话维度，天然支持断点续作、跨请求恢复；
- 每次回合从检查点恢复状态，结束落库，因此 `/agent/stream` 无需幂等重放历史。

### 4.4 流式事件

`/agent/stream/{thread_id}` 以 SSE 推送两类事件：**进度类**（`node_start`/`node_stream`/`progress`/`tool_start`/`tool_end`）驱动前端节点状态 UI，**内容类**（`think_start`/`agent_reasoning`/`agent_token`）驱动回复正文与思考流。空闲时周期心跳 `keepalive`，客户端 60s 无数据主动断开。

## 5. 质量把关与审核卡

Agent 的**写操作**一律不直接落库，走「工具门控 → 人工决策 → 落库」链路：

```
Agent 写操作 ──► gated_tool_node ──► review_card（SSE 推送）──► 前端审核卡 UI
                                                                    │
                         accept / edit / retry / terminate ◄────────┘
                                                                    │
                                   POST /agent/review-action ───────► 写审计 + 继续图执行
```

- 决策写入 `agent_write_audits`（工具名、操作、参数摘要、决策、结果、meta），全流程可追溯；
- 回合指标（子图、时长、LLM/工具调用数、压缩/审批次数）写入 `agent_turn_metrics`，供前端洞察面板展示；
- 与书籍锁联动：写章节遇到锁冲突返回 `503`，前端提供「解锁并重试」。

## 6. 上下文管理

长会话下上下文是 Agent 正确性的主要风险，设计了三层防御：

| 机制 | 触发条件 | 行为 |
|---|---|---|
| `context_manager` | 每回合 | 摘要裁剪超长历史（保留关键结构） |
| `auto_compress_node` | 消息量超阈值 | 生成摘要写入 `AgentMemory`，并裁剪 checkpoint（压缩前后检查点都被保留，可回退） |
| 显式压缩 `/agent/compress` | 用户主动 | 同样写记忆 + 裁剪（限流 5/分钟） |

- **Agent 记忆**：`agent_memories` 表带 `Vector` 列，检索接口 `mode=vector`（语义）与 `mode=fulltext`（全文）双通道；**未配置 embedding 时自动降级 fulltext**（避免 `_EmbeddingStub` 空向量导致检索恒空——历史事故）；
- **节点级 RAG**：每个角色节点可配置独立检索（query/top_k/doc_ids/sample/author_ids），检索结果带 Redis 缓存（键含 query+filter+维度+topk）。

## 7. 并发控制

并发场景：同一用户多标签页、多设备、Agent 流与手工编辑同时进行。

| 锁 | 实现 | 用途 |
|---|---|---|
| 书籍锁 | Redis `SET NX` + 心跳续期 | Agent 写书籍内容期间互斥，防止多线程写坏手稿 |
| 线程锁 | Redis，与流式任务绑定 | 同一 thread 同时仅允许一个流 |
| 实体锁 | `shared/lock_guard.py`（DB 字段 + Redis 校验） | 角色/地点/伏笔/情节线/场景事件/创意设定防误改 |
| 剧情流乐观锁 | `node_seq` 版本号 | 并发推进冲突返回 `409`，前端自动重建 |
| 在途任务表 | 进程内 `_stream_tasks` | 防止同线程并发重复流式任务；进程关闭时统一取消 |

注意：`_stream_tasks` 为进程内注册表，多 worker 部署时同线程互斥由 Redis 线程锁兜底。

## 8. 实时通信设计

### 8.1 SSE（Agent / 向导 / 剧情流）

统一模式：`fetch` POST + `response.body.getReader()` 逐行解析 `data: ` 帧（`shared/sse.ts`），共享组件处理 buffering、60s 空闲 watchdog、`AbortSignal` 合并。流式请求同样走鉴权封装（token 过期自动刷新后重试，与 REST 一致）。

### 8.2 WebSocket（SimRoom）

```
浏览器                              WS /api/sim-rooms/{id}/ws              服务端
  │  Sec-WebSocket-Protocol: <token> ──────────────────────────────► 校验
  │  {type:"config", modelConfig} ───► 回合循环 ◄─── {stream_token* / turn_done}
  │  chat / auto_advance / branch / end
```

- **token 走子协议**而非 query 参数，避免 WebSocket URL 进入访问日志造成凭据泄露；
- **断线回滚**：客户端记录未定稿（未收到 `turn_done`/`end`）的流式片段，重连后以 REST `GET /sim-rooms/{id}` 重新对齐历史；
- 连接状态用指数退避重连（1s → 10s），心跳保活。

## 9. 前端架构

### 9.1 状态管理划分

| Store | 职责 | 持久化 |
|---|---|---|
| `useAuthStore` | user / accessToken / 登录态 / 刷新 | user 存 IndexedDB |
| `useBookDetailStore` | 书籍详情页聚合状态 + Agent 消息流（discriminated union） | 无 |
| `useManuscriptStore` | 手稿章节树 / 正文 / 版本 / 保存竞态 | 无 |
| `useEntityStore` | 世界实体集合 + CRUD（makeCrudSlice 工厂） | 无 |
| `useMapStore` / `useTimelineStore` / `useInitializerStore` | 画布选择态 / 时间线 / 初始化器 | 无 |
| `useModelSettings` | 模型配置（API Key、embedding、搜索） | IndexedDB |

持久化选 IndexedDB（`idb`）而非 localStorage：凭据类数据不暴露给任何可被 XSS 读取的存储。

### 9.2 API 客户端

`axios` 实例统一处理三件事：请求头注入（hydration 后附 Bearer）、401 单飞刷新重试、错误归一化为 `ApiError`（兼容 FastAPI 的字符串 detail / 422 数组 / `{message}` 三种形态），再经 `parseApiError → getApiErrorMessage/hint` 映射为 sonner toast 的可操作提示（如 `INVALID_API_KEY` → 引导去设置页填 Key）。

### 9.3 端侧向量检索（个人知识库）

```
文档 → chunk → bge-zh embedding（transformers.js，经 /api/models/proxy 下载权重）
     → altor-vec（wasm HNSW）建索引 → IndexedDB（KbDocRecord + 索引分档）
```

- SHA-256 去重、20MB 预检、精度档位切换（`resetForTier` 重建索引）；
- embedding 权重经后端白名单代理下载（仓库/文件后缀白名单 + IP 限流），支持国内镜像容灾；
- 个人库检索完全在浏览器端完成，文档不出本地；公共库文档的向量检索由后端 Agent 发起（前端仅列表/下载）。

### 9.4 保存竞态（手稿编辑器）

切章先 flush、保存期间新编辑保持 dirty 补偿再存（`pendingSave` 队列），避免「保存覆盖新输入」与「连续保存乱序」两类竞态；章节锁定返回 `409` 时前端提示并阻断。

## 10. 数据模型设计

核心聚合关系（PostgreSQL + pgvector，应用启动自动建表/增量迁移，无 Alembic）：

```
users 1──N books 1──N volumes 1──N chapters 1──N chapter_contents（版本链）
 │             └── 1:1 creative_settings / book_context_configs
 │             ├── N characters（relationship_chain JSONB 关系链）
 │             ├── N locations / scene_events / foreshadowings / plot_threads（world）
 │             ├── N conversations 1──N messages（thread_id 关联 LangGraph checkpoint）
 │             ├── N agent_memories（embedding Vector）
 │             └── N sim_rooms（participants / messages / branches）
users 1──N documents 1──N chunks（公共知识库，embedding Vector）
users 1──N workflows（nodes/edges JSONB）
users 1──N story_flows 1──N story_flow_nodes（node_seq 乐观锁）
users 1──N writing_sessions（字数/时长统计）
agent_write_audits / agent_turn_metrics（审计与指标）
```

设计要点：

- **JSONB 存关系型不强约束的结构**：角色别名/自定义属性、情节线关联角色、自定义工作流节点——避免过度建表；
- **正文版本链**：`(chapter_id, version)` 唯一约束，提供 diff；
- **公共库与个人库分离**：公共文档走服务端存储 + pgvector，个人库走浏览器 IndexedDB，物理隔离；
- **软删除 vs 级联删除**：采用真删除 + 外键级联（书籍删除时按 book_id 精确清理，历史事故：未带 book_id 的清理语句会误清跨书数据）。

## 11. 关键设计决策

| 决策 | 取舍 | 理由 |
|---|---|---|
| 嵌套编译子图（4 域） | 复杂度 ↑ | 按域隔离 prompt/工具，防上下文爆炸；父图扁平保流式事件可靠 |
| Agent 写操作人工把关 | 自动化 ↓ | 创作场景质量优先，写操作必须经审核卡，全部留痕 |
| 前端不做公共库向量检索 | 功能 ↓ | 公共库检索由后端 Agent 按需发起，避免把全库 embedding 拉给浏览器 |
| embedding 缺失降级全文检索 | 准确性 ↓ | 配置缺失是常态，降级保可用（历史：空向量导致检索恒空） |
| 无 Alembic，启动增量迁移 | 演进自由度 ↓ | 个人项目单库快速迭代，`create_all` + 存量补列足够 |
| 双 token（内存 + HttpOnly） | 复杂度 ↑ | XSS 窃取不了 refresh token；改密/登出可即时吊销 |
| 错误信息分级脱敏 | 可调试性 ↓ | 未捕获异常只回通用文案，细节仅日志，防泄露内部结构 |
| docker 仅容器化 PG/Redis | 部署成本 ↑ | 后端源码运行便于调试与热更新，AI 类应用迭代频繁 |
