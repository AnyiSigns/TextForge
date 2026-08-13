# TextForge 部署指南

本文档说明 TextForge 的生产部署方式。架构概览见 [ARCHITECTURE.md](ARCHITECTURE.md)，接口见 [API.md](API.md)。

> 注意：本项目为开源、个人维护项目，**不保证用户数据存储**，请务必配置定时备份，并在产品中提醒用户及时导出数据。

## 目录

- [1. 部署拓扑](#1-部署拓扑)
- [2. 前置条件](#2-前置条件)
- [3. 基础设施（PostgreSQL + Redis）](#3-基础设施postgresql--redis)
- [4. 后端部署](#4-后端部署)
- [5. 前端构建与部署](#5-前端构建与部署)
- [6. Nginx 配置](#6-nginx-配置)
- [7. 数据备份与恢复](#7-数据备份与恢复)
- [8. 升级注意事项](#8-升级注意事项)
- [9. 故障排查](#9-故障排查)

---

## 1. 部署拓扑

```
浏览器
  │ HTTPS
  ▼
Nginx（443）
  ├─ /            → 前端 standalone（node server，默认 3000）
  ├─ /api/*       → 后端 FastAPI（:8000，含 SSE / WebSocket 升级）
  ├─ /static/*    → 后端静态目录（头像等）
  └─ /ort-wasm/*  → jsDelivr CDN（onnxruntime wasm，或本地托管）
  │
  ├─ 后端 FastAPI（uvicorn/gunicorn，宿主机运行）──► PostgreSQL（127.0.0.1:5433）
  │                                                     + Redis（127.0.0.1:6380）
  └─ 前端 node server（.next/standalone）
```

- 官方仓库中 `docker compose` **仅容器化 PostgreSQL 与 Redis**；前后端均以宿主机源码/构建产物运行（AI 类应用迭代频繁，便于热更新与调试）；
- 生产环境必须经 Nginx（或等价反代）统一入口：HTTPS 终止、`/api` 与 `/static` 转发、SSE 与 WebSocket 所需的反代配置（见 §6）。

## 2. 前置条件

- Linux/macOS/Windows + Docker（Compose v2）
- Python 3.11+（后端）
- Node.js 20+ 与 pnpm（前端构建）
- Nginx 1.20+（或自选反代）

## 3. 基础设施（PostgreSQL + Redis）

```bash
cd text_forge_backend
# 首次部署前：修改 docker-compose.yml 中的数据库口令
#   POSTGRES_PASSWORD: <强随机口令>
#   Redis 如需口令，加 command: redis-server --appendonly yes --requirepass <口令>
docker compose up -d
```

启动结果（仅本机回环地址可达）：

| 服务 | 镜像 | 对外地址 | 说明 |
|---|---|---|---|
| postgres | `pgvector/pgvector:pg18` | `127.0.0.1:5433` | 库 `text_forge`；首次启动执行 `initdb/` 启用 pgvector 扩展（**仅首次**，数据卷已建后不再执行） |
| redis | `redis:7-alpine` | `127.0.0.1:6380` | AOF 持久化（appendonly yes） |

验证：

```bash
docker compose ps                 # 两个服务均 healthy
docker exec text_forge_db psql -U postgres -d text_forge -c "SELECT extname FROM pg_extension;"
# 应包含 vector
```

> 若宿主机端口冲突，改 compose 的映射端口并同步修改后端 `.env` 中对应 URL/端口。

## 4. 后端部署

### 4.1 安装依赖与配置

```bash
cd text_forge_backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

### 4.2 生产环境变量矩阵

| 键 | 生产建议 | 说明 |
|---|---|---|
| `ENV` | `production` | 启用 `ALLOWED_ORIGINS` CORS 白名单 |
| `ALLOWED_ORIGINS` | 你的前端域名（逗号分隔，如 `https://forge.example.com`） | 生产下 CORS 仅放行白名单 |
| `JWT_SECRET_KEY` | **强随机 ≥32 字符**（`openssl rand -hex 32`） | 泄露即所有令牌可伪造 |
| `POSTGRES_DB_URL` | `postgresql+asyncpg://postgres:<口令>@127.0.0.1:5433/text_forge` | 端口与 compose 映射一致 |
| `POSTGRES_GRAPH_URL` | `postgresql://postgres:<口令>@127.0.0.1:5433/text_forge` | LangGraph 检查点库，同步协议 |
| `REDIS_HOST/PORT` | `127.0.0.1` / `6380` | 与 compose 映射一致 |
| `EMAIL_*` | 真实 SMTP | 注册/改密/注销依赖邮件验证码 |
| `STATIC_URL` | `static` | 头像等上传文件的根目录（相对后端运行目录） |
| `LOG_JSON` | `true` | 结构化日志便于采集 |
| `LLM_TIMEOUT` | `120` | SSE 流式空闲/连接超时上限 |

后端启动时会自动建表并为存量库增量迁移（无 Alembic），无需手工执行 SQL。

### 4.3 进程管理（多 worker）

```bash
# 单进程开发/小流量
uvicorn main:app --host 127.0.0.1 --port 8000 --workers 2
```

- 推荐 `gunicorn -k uvicorn.workers.UvicornWorker -w 2-4 main:app`（AI 流式请求占用连接时间长，worker 数 = 2 × CPU 核数以内，避免连接耗尽）；
- 多 worker 下并发安全由 Redis 兜底：书籍锁/线程锁/限流均在 Redis，进程内 `_stream_tasks` 注册表仅影响同进程的取消精度，可接受；
- 健康检查接入：`GET /api/health/ready`（含数据库/Redis 就绪探测）。

**systemd 示例**（`/etc/systemd/system/textforge-backend.service`）：

```ini
[Unit]
Description=TextForge Backend
After=network.target docker.service

[Service]
User=forge
WorkingDirectory=/opt/textforge/text_forge_backend
ExecStart=/opt/textforge/text_forge_backend/.venv/bin/gunicorn -k uvicorn.workers.UvicornWorker \
          -w 2 --bind 127.0.0.1:8000 main:app
Restart=always
RestartSec=3
EnvironmentFile=/opt/textforge/text_forge_backend/.env

[Install]
WantedBy=multi-user.target
```

```bash
systemctl daemon-reload && systemctl enable --now textforge-backend
curl -s http://127.0.0.1:8000/api/health/ready
```

> `STATIC_URL` 相对路径时，请确认运行用户对 `static/`（头像目录）有写权限。

## 5. 前端构建与部署

### 5.1 环境变量（`.env.production`，已随仓库提供）

```
NEXT_PUBLIC_API_URL=/api
NEXT_PUBLIC_MODEL_PROXY_URL=/api/models/proxy
```

生产采用同源相对路径：所有 `/api`、`/static` 由 Nginx 转发，避免前端直连后端端口。

### 5.2 构建

```bash
cd text_forge_front_remastered_edition
pnpm install
pnpm build        # next build --turbopack，output: standalone
```

### 5.3 运行 standalone 产物

Next.js `output: 'standalone'` 产物需要补齐静态资源后由 node 直接运行：

```bash
mkdir -p /opt/textforge/frontend
cp -r .next/standalone/* /opt/textforge/frontend/
cp -r .next/static    /opt/textforge/frontend/.next/static
cp -r public          /opt/textforge/frontend/public
```

```bash
cd /opt/textforge/frontend
PORT=3000 HOSTNAME=0.0.0.0 node server.js
```

> standalone 的 server.js 内部通过 `BACKEND_URL`（默认 `http://localhost:8000`）把 `/api`、`/static` 代理给后端。若前端与后端在同一台机器，保持默认即可；**若单独部署，需设置 `BACKEND_URL` 指向后端内网地址**（注意：此时同源相对路径仍可用，因为代理发生在 Next 服务端）。

前端同样用 systemd 守护（`ExecStart=/usr/bin/node server.js`，`WorkingDirectory=/opt/textforge/frontend`，`Environment=PORT=3000 BACKEND_URL=http://127.0.0.1:8000`）。

## 6. Nginx 配置

关键点：**SSE 必须关缓冲**、**WebSocket 必须带 Upgrade 头**、长超时（AI 生成可达数分钟）。

> 下面的 `limit_req_zone` 需放在 Nginx `http {}` 块（如 `/etc/nginx/nginx.conf` 的 http 段，或 `conf.d/*.conf` 中），示例文件仅含 server 段。

```nginx
# ---- http {} 块内 ----
limit_req_zone $binary_remote_addr zone=proxy_per_ip:10m rate=120r/m;

# ---- server {} 块 ----
upstream textforge_backend { server 127.0.0.1:8000; }
upstream textforge_frontend { server 127.0.0.1:3000; }

server {
    listen 443 ssl http2;
    server_name forge.example.com;

    ssl_certificate     /etc/nginx/ssl/fullchain.pem;
    ssl_certificate_key /etc/nginx/ssl/privkey.pem;

    client_max_body_size 20m;   # 知识库上传 ≤10MB + 头像余量

    # ---- 前端页面 ----
    location / {
        proxy_pass http://textforge_frontend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    # ---- API（含 SSE：必须关缓冲、加大超时）----
    location /api/ {
        proxy_pass http://textforge_backend;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Request-ID $request_id;

        proxy_buffering off;            # SSE 关键：禁止缓冲，否则流式延迟/中断
        proxy_cache off;
        proxy_read_timeout 600s;        # 覆盖最长生成耗时（LLM_TIMEOUT 之上留余量）
        proxy_send_timeout 600s;

        # WebSocket（SimRoom）
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";

        # 大文件上传（知识库/头像）
        proxy_request_buffering off;
    }

    # ---- 后端静态（头像等）----
    location /static/ {
        proxy_pass http://textforge_backend;
        proxy_set_header Host $host;
        proxy_cache_valid 200 1h;       # 头像等可短缓存
    }

    # ---- onnxruntime wasm（前端端侧 embedding 依赖）----
    # 默认走 jsDelivr CDN（next.config.ts 内置重写），
    # 内网/离线环境可改为本地托管：
    location /ort-wasm/ {
        proxy_pass https://cdn.jsdelivr.net/npm/onnxruntime-web@1.16.0/;
        proxy_set_header Host cdn.jsdelivr.net;
        proxy_ssl_server_name on;
    }

    # ---- 模型权重代理（可选加固：仅浏览器 embedding 权重下载）----
    location /api/models/proxy/ {
        proxy_pass http://textforge_backend;
        proxy_set_header Host $host;
        limit_req zone=proxy_per_ip burst=20 nodelay;   # 配合后端 IP 限流
    }
}
```

```bash
nginx -t && systemctl reload nginx
```

验证链路：`/api/health/ready` → 注册/登录 → 打开任意书籍触发一次 Agent 对话（确认 SSE 流畅、无缓冲延迟）→ SimRoom 会话（确认 WebSocket 升级头生效）。

## 7. 数据备份与恢复

```bash
# PostgreSQL（业务 + Agent 检查点同库）
pg_dump -h 127.0.0.1 -p 5433 -U postgres -F c -f backup_$(date +%F).dump text_forge

# Redis（限流/锁为瞬态可略；AOF 已开启，如需完整备份直接备份数据卷）
docker cp text_forge_redis:/data/dump.rdb ./redis-dump.rdb   # 或备份 redisdata 卷

# 恢复
pg_restore -h 127.0.0.1 -p 5433 -U postgres -d text_forge --clean backup.dump
```

- 建议 cron 每日全量 + 保留最近 N 份；恢复前先停止后端（避免连接占用与写入竞态）；
- 头像目录（后端 `static/`）单独纳入备份；
- 前端无状态，无需备份。

## 8. 升级注意事项

1. **先备份**（见 §7）；
2. **后端先行**：拉取新代码 → `pip install -r requirements.txt` → 重启。启动时自动执行建表/增量补列/种子内置工作流，检查日志无迁移错误；
3. **前端后行**：`pnpm build` 后按 §5.3 覆盖 standalone 产物（保留 `public` 与 `.next/static` 覆盖不删）；
4. `docker compose pull && docker compose up -d` 升级 PG/Redis 镜像（pgvector 数据卷兼容升级；initdb 不重复执行）；
5. 升级后验证：`/api/health/ready`、登录、一次 Agent 流式对话、一次 SimRoom 会话。

## 9. 故障排查

| 现象 | 排查方向 |
|---|---|
| `/api/health/ready` 非 200 | 检查 PG/Redis 容器健康状态、`.env` 端口是否与 compose 映射一致 |
| 页面可开但接口 401 循环 | refresh Cookie 未携带：Nginx 是否丢失 `Set-Cookie`（检查 `proxy_set_header`）、HTTPS 与 Cookie `Secure` 属性 |
| SSE 卡顿/无输出 | Nginx 是否 `proxy_buffering off`；后端 `LLM_TIMEOUT` 是否过小；模型 Key 是否有效（错误会以 `error` 事件推送） |
| SimRoom 秒断/502 | Nginx 是否配置 `Upgrade`/`Connection: upgrade`；token 子协议是否被反代剥离 |
| 上传 413 | `client_max_body_size` 不足（公共库 ≤10MB） |
| 重启后书籍显示「被占用」 | 后端启动时会清理残留的 `agent:book_lock:*`；若仍占用，调用 `DELETE /api/agent/book-lock?book_id=` 强制释放 |
| 端侧 embedding 下载失败 | `/ort-wasm` 与 `/api/models/proxy` 是否可达（内网需按 §6 本地托管 onnxruntime）；浏览器控制台查看具体 URL |
| 向量检索恒空结果 | 检查 embedding 配置是否齐全；未配置时接口自动降级全文检索（属预期行为） |
