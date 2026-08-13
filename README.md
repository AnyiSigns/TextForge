# TextForge

> AI 驱动的中文小说创作工具 —— 集世界构建、角色管理、Agent 协作创作、模拟推演于一体的创作工作台。

TextForge 将小说创作拆解为可管理的数据结构与可协作的创作流程：

- **世界构建**：以地图画布组织地点、时间线、伏笔、情节线、角色关系链与场景事件；
- **Agent 协作**：基于 LangGraph 编排多角色 Agent（世界观、大纲、草稿、修订四域子图），以 SSE 流式对话 + 质量审核卡（人工把关）方式协同创作；
- **模拟推演**：SimRoom 以 WebSocket 驱动角色实时对话，剧情流（StoryFlow）支持交互式剧情推演；
- **知识库**：个人库端侧向量检索（wasm + 本地 embedding 模型），公共库由后端 Agent 检索。

> 注意：本项目为开源、个人维护项目，**不保证用户数据的持久存储**，请及时导出备份你的数据。

## 目录

- [功能特性](#功能特性)
- [技术架构](#技术架构)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [环境变量](#环境变量)
- [测试](#测试)
- [部署](#部署)
- [API 文档](#api-文档)
- [致谢](#致谢)
- [许可证](#许可证)

其他文档：[架构设计](docs/ARCHITECTURE.md) · [API 参考](docs/API.md) · [部署指南](docs/DEPLOY.md) · [用户协议](docs/用户协议.md) · [免责声明](docs/免责声明.md)

## 功能特性

### 创作核心

- **书籍管理**：创建/编辑/删除书籍，卷-章两级目录，正文多版本管理与版本 diff；
- **世界地图**：画布式地图 + 时间线，管理地点、角色、场景事件、伏笔、情节线，实体间关系链可视化；
- **创意设定**：世界观、文风基调、写作禁忌、自定义维度，可锁定避免误改；
- **手稿编辑器**：章节树 + 富正文编辑，自动保存与竞态补偿、锁定章节保护、导入/导出（md/txt/epub/pdf）；
- **创作向导（Wizard）**：SSE 流式生成完整创作方案（世界观/地点/角色/情节线/大纲/事件/伏笔）。

### Agent 协同创作

- **多域 Agent 编排**：LangGraph 扁平父图 + 世界构建/大纲/草稿/修订四个编译子图，检查点持久化（PostgreSQL）、断点续作；
- **流式对话**：SSE 流式输出（思考、工具调用、进度、token），心跳保活、可取消、书籍级并发锁互斥；
- **质量把关**：Agent 写操作需经过审核卡（Review Card）人工决策（接受/编辑/重试/终止），全流程审计与回合指标落库；
- **上下文管理**：自动压缩、Agent 记忆（语义/全文双通道检索）、节点级 RAG 检索配置；
- **自定义工作流**：节点画布（@xyflow/react）编辑多角色工作流，内置/自定义工作流，执行器分层（main/audit/tool/router）。

### 角色模拟与剧情推演

- **SimRoom 模拟房间**：WebSocket 实时驱动多个角色（用户角色/剧情角色/场景 NPC）对话，支线沉淀（背景故事/关系/情节线），断线自动重连对齐；
- **剧情流（StoryFlow）**：交互式剧情推演，选项分支推进、乐观锁防并发、30 幕上限。

### 知识库

- **个人知识库**：浏览器端向量检索（altor-vec wasm HNSW + bge-zh embedding），文档落 IndexedDB，SHA-256 去重，精度档位切换；
- **公共知识库**：上传/列表/下载/删除（仅作者），向量检索由后端 Agent 发起；
- **Agent 记忆**：创建/编辑/检索记忆，语义检索与全文检索自动降级。

### 账号与安全

- 邮箱验证码注册/登录，JWT access token（内存态）+ refresh token（HttpOnly Cookie）；
- 密码双通道修改（旧密码/邮箱验证码）、账号自助注销（级联清理）、登录失败限流防枚举；
- 头像上传、实体锁定并发保护、Redis 限流、SSRF 防护、日志脱敏。

## 技术架构

> 深入的设计说明（Agent 图编排、并发控制、认证生命周期、数据模型、关键决策）见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

```
┌─────────────────────────────┐          ┌──────────────────────────────┐
│  前端 (text_forge_front_…)  │  /api    │  后端 (text_forge_backend)   │
│  Next.js 16 + React 19      │ ───────► │  FastAPI + LangGraph         │
│  zustand 状态管理           │  SSE/WS  │  SQLAlchemy 2.x (async)      │
│  @xyflow/react 工作流画布   │ ───────► │  pgvector 向量检索           │
│  altor-vec wasm 端侧向量    │          │  Redis 缓存/限流/锁          │
└─────────────────────────────┘          └──────────────────────────────┘
```

| 层 | 技术选型 |
|---|---|
| 前端框架 | Next.js 16 (App Router) + React 19 + TypeScript 5（strict） |
| 前端状态 | zustand（auth/书籍详情/手稿/实体/地图/时间线）+ IndexedDB 持久化 |
| 前端 UI | 自研 Tailwind v4 组件库（`src/shared/ui`）+ lucide-react + framer-motion + sonner |
| 后端框架 | FastAPI + Uvicorn + Pydantic v2，路由前缀 `/api` |
| ORM / 数据库 | SQLAlchemy 2.x（异步）+ PostgreSQL + pgvector |
| Agent 编排 | LangGraph 1.2.x + LangChain，PostgreSQL 检查点（AsyncPostgresSaver 连接池） |
| 缓存/并发 | Redis（限流、令牌黑名单、RAG 缓存、书籍/线程锁） |
| 模型接入 | 多 Provider 惰性工厂：OpenAI/DeepSeek/通义/Ollama/Gemini/Anthropic/智谱/Moonshot/千帆/HuggingFace/Cohere/百度 等 |
| 实时通信 | SSE（Agent/向导/剧情流）+ WebSocket（SimRoom，token 走子协议） |
| 测试 | 后端 pytest（async auto）；前端 Vitest + Playwright E2E |

## 项目结构

```
TextForge/
├── text_forge_backend/               # FastAPI 后端
│   ├── main.py                       # 应用入口：lifespan、CORS、中间件、路由挂载
│   ├── config/                       # 配置层：settings / logging / model_wrapper
│   ├── core/                         # 横切：auth 依赖、security、错误处理、LLM 重试、ModelFactory
│   ├── shared/                       # 基础设施：database、graph_store、redis、限流、锁、分页、BaseRepository
│   ├── models/                       # SQLAlchemy ORM 模型
│   ├── schema/                       # Pydantic 请求/响应模型
│   ├── domains/                      # 业务域（router → service → repository 分层）
│   │   ├── auth/                     #   注册/登录/邮箱验证/JWT
│   │   ├── user/                     #   用户资料/改密/头像/注销
│   │   ├── book/                     #   书籍/卷/章/正文/角色/创意设定/导出
│   │   ├── world/                    #   地点/时间线/伏笔/情节线/场景事件
│   │   ├── agent/                    #   Agent 图编排、SSE 流式、并发锁、审计、指标
│   │   ├── workflow/                 #   工作流 CRUD + 执行
│   │   ├── knowledge/                #   公共知识库（RAG）
│   │   ├── memory/                   #   Agent 记忆
│   │   ├── wizard/                   #   创作向导流式生成
│   │   ├── sim_rooms/                #   模拟房间（WebSocket）
│   │   ├── story_flow/               #   剧情推演（SSE）
│   │   ├── writing_session/          #   写作会话与统计
│   │   ├── model/                    #   模型测试 + 权重代理
│   │   ├── lock/ system/ common/     #   实体锁 / 健康检查+同步 / gating
│   ├── initdb/                       # 仅启用 pgvector 扩展的 SQL
│   └── tests/                        # pytest 测试（约 299 用例）
└── text_forge_front_remastered_edition/   # Next.js 前端
    ├── src/app/                      # App Router 页面
    │   ├── (auth)/                   #   login / register / verify-email
    │   ├── (dashboard)/              #   books / books/[id](世界地图) / workflow / knowledge / settings / characters/[id]
    │   └── manuscript/book/[bookId]/ #   手稿编辑器
    ├── src/features/                 # 功能模块（map、agent、SimRoom、StoryFlow、settings…）
    ├── src/shared/                   # api 客户端、stores、ui 组件库、lib
    ├── tests/                        # Vitest 单测 + e2e（Playwright）
    └── scripts/                      # gen-agent-types（OpenAPI 生成类型）
```

## 快速开始

### 环境要求

- Python 3.11+
- Node.js 20+ 与 pnpm
- Docker（仅用于 PostgreSQL + Redis）

### 1. 启动基础设施（PostgreSQL + Redis）

```bash
cd text_forge_backend
docker compose up -d
```

PostgreSQL 映射到 `127.0.0.1:5433`（库 `text_forge`，首次启动自动执行 `initdb/` 启用 pgvector），Redis 映射到 `127.0.0.1:6380`。

### 2. 启动后端

```bash
cd text_forge_backend
python -m venv .venv && .venv\Scripts\activate   # Windows；macOS/Linux 用 source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env                              # 填写 JWT_SECRET_KEY（≥16 字符）与两个 PG URL
uvicorn main:app --reload --port 8000
```

后端启动时会自动建表（`Base.metadata.create_all`）并为存量库做增量迁移（无 Alembic），同时种子内置工作流。健康检查：`GET /api/health/ready`。

### 3. 启动前端

```bash
cd text_forge_front_remastered_edition
pnpm install
# 按需创建 .env.local（键名见下文「环境变量」章节；省略时默认走 /api 同源代理）
pnpm dev
```

访问 http://localhost:3000。开发模式下 Next.js 通过 `next.config.ts` 的 rewrites 将 `/api/*` 代理到后端（默认 `http://localhost:8000`）。

## 环境变量

### 后端（`text_forge_backend/.env`，参考 `.env.example`）

| 分组 | 键 | 说明 |
|---|---|---|
| 应用 | `ENV` | `development` / `production`，生产环境使用 `ALLOWED_ORIGINS` 白名单 |
| | `ALLOWED_ORIGINS` | CORS 白名单（逗号分隔） |
| 日志 | `LOG_LEVEL` / `LOG_JSON` / `LOG_FILE_PATH` | 日志级别、JSON 结构化输出、轮转文件路径 |
| JWT | `JWT_SECRET_KEY` | **必填**，≥16 字符 |
| | `JWT_ALGORITHM` / `JWT_ACCESS_TIME` / `JWT_EXPIRE_TIME` | HS256 / access 15min / refresh 7d |
| 数据库 | `POSTGRES_DB_URL` | 业务库（asyncpg 协议） |
| | `POSTGRES_GRAPH_URL` | LangGraph 检查点库（psycopg 同步协议） |
| | `AUTO_CREATE_TABLES` / `SQL_ECHO` | 自动建表 / SQL 回显 |
| 邮件 | `EMAIL_SERVER` / `EMAIL_PORT` / `EMAIL_USERNAME` / `EMAIL_PASSWORD` / `EMAIL_FROM` | SMTP 验证码邮件 |
| | `CAPTCHA_TIME` | 验证码有效期（默认 5 分钟） |
| Redis | `REDIS_HOST` / `REDIS_PORT` / `REDIS_DB` | 默认 `localhost:6379` |
| 静态 | `STATIC_URL` | 头像/附件静态目录 |
| LLM | `LLM_TIMEOUT` | 流式空闲/连接超时（默认 120s） |

### 前端（`text_forge_front_remastered_edition/.env.local`）

| 键 | 说明 |
|---|---|
| `NEXT_PUBLIC_API_URL` | 后端 API 地址（默认 `/api`，本地可用 `http://localhost:8000/api`） |
| `NEXT_PUBLIC_MODEL_PROXY_URL` | 模型权重代理地址（默认 `/api/models/proxy`） |
| `BACKEND_URL` | 服务端 rewrites 代理目标（默认 `http://localhost:8000`） |
| `E2E_EMAIL` / `E2E_PASSWORD` | 仅 Playwright E2E 登录链路使用 |

## 测试

```bash
# 后端（默认跳过需要真实 LLM Key 的 live 标记用例）
cd text_forge_backend && pytest          # 约 299 通过 / 3 跳过

# 前端
cd text_forge_front_remastered_edition
pnpm test          # Vitest 单元/集成
pnpm typecheck     # TypeScript 严格检查
pnpm lint          # ESLint
pnpm exec playwright test   # E2E（自动拉起前后端，需 E2E_EMAIL/E2E_PASSWORD）
```

## 部署

> 完整生产部署步骤（Nginx 配置、进程守护、备份恢复、故障排查）见 [docs/DEPLOY.md](docs/DEPLOY.md)。

- `docker compose up -d` 仅部署 **PostgreSQL（pgvector）与 Redis**；后端建议以源码 + `uvicorn` 运行于宿主机或自建镜像；
- 前端 `next build`（`output: 'standalone'`）后可独立部署，`/api` 与 `/static` 路径由反向代理转发至后端；
- 生产环境必须设置 `ENV=production` 与 `ALLOWED_ORIGINS`，并确保 `JWT_SECRET_KEY` 与数据库口令通过安全渠道注入。

## API 文档

完整接口说明见 [docs/API.md](docs/API.md)。要点：

- 所有路由挂载于 `/api` 前缀（如 `POST /api/auth/login`）；
- 除 `health`、`models/proxy` 与 `auth` 系列外，均需 `Authorization: Bearer <access_token>`；
- 刷新令牌由后端通过 HttpOnly Cookie（`tf_rt`）下发，前端 JS 不可读；
- Agent 对话为 SSE 流式（`POST /api/agent/stream/{thread_id}`），SimRoom 为 WebSocket（`/api/sim-rooms/{room_id}/ws`）；
- 统一错误结构：`{"detail": "...", "error_code": "...", "hint": "..."}`，未捕获异常返回通用文案（细节仅记日志）。

## 致谢

TextForge 建立在众多优秀的开源项目之上：

- [FastAPI](https://fastapi.tiangolo.com/)、[LangGraph](https://github.com/langchain-ai/langgraph)、[LangChain](https://github.com/langchain-ai/langchain) —— API 框架与 Agent 编排
- [Next.js](https://nextjs.org/)、[React](https://react.dev/)、[Zustand](https://github.com/pmndrs/zustand) —— 前端框架与状态管理
- [PostgreSQL](https://www.postgresql.org/)、[pgvector](https://github.com/pgvector/pgvector)、[Redis](https://redis.io/) —— 数据存储与实时协同
- [@xyflow/react](https://xyflow.com/)、[Hugging Face transformers.js](https://huggingface.co/docs/transformers.js)、[altor-vec](https://github.com/paritytech/altor-vec) —— 画布、端侧模型与向量检索
- 以及所有直接或间接支持本项目开发的贡献者与社区。

## 许可证

[MIT](LICENSE) © 2026 Anyi
