# 种子生成（一句话开局 / 中途单补）后端接口契约

前端目录：`src/lib/seed/`（generate.ts / merge.ts）
类型定义：`src/types/index.ts` 的 `ProjectSeed` / `SeedBrief` / `SeedOutline` / `SeedCharacter` / `SeedRequest` / `SeedPart`

---

## 1. 总览

种子生成把用户「一句话」转成结构化三项，前端经增量合并回填 `brief / outline / characters` 三个 store，再衔接内置创作流水线。

| 能力 | 前端函数 | 后端接口 |
|------|----------|----------|
| 一句话开局（填满三项） | `generateSeed(projectId, prompt)` | `POST /api/projects/:id/seed` |
| 中途单补某一项 | `generatePart(projectId, part, {prompt?, context?})` | `POST /api/projects/:id/seed/part` |
| 流式开局（可选） | `streamSeed(...)` | `POST /api/projects/:id/seed/stream` (SSE) |

---

## 2. POST /api/projects/:id/seed

请求体：
```json
{ "prompt": "一艘拾荒船打捞星海记忆的科幻故事" }
```

响应（200）：
```json
{
  "data": {
    "brief": {
      "genre": "科幻",
      "worldview": "文明记忆正随星海漂流消散…",
      "tone": "苍凉而温柔",
      "forbidden": "避免硬科幻术语堆砌",
      "styleGuide": "诗化白描",
      "wordCountGoal": 80000,
      "dailyWordCountGoal": 1000,
      "sections": [{ "id": "sec-xxx", "title": "核心矛盾", "content": "…", "pinned": true }]
    },
    "outline": {
      "volumes": [{
        "id": "vol-xxx",
        "title": "第一卷",
        "chapters": [{
          "id": "ch-xxx",
          "title": "第一章",
          "nodes": [{ "id": "nd-xxx", "title": "钩子", "content": "…", "targetWords": 2000 }]
        }]
      }]
    },
    "characters": [
      { "id": "char-xxx", "name": "林墨", "description": "…", "role": "protagonist", "status": "存活", "currentProfile": "…" }
    ]
  },
  "meta": { "version": 1 }
}
```

**关键约定**：
- **所有 `id` 由后端生成并返回**，前端回填时信任这些 id（不前端造 uid），保证跨端稳定、RAG chunk / currentProfile 关联一致。
- 字段形状直接对齐前端 store 类型（`ProjectBrief` / `OutlineVolume[]` / `Character`），无需前端解析文本。
- 响应包在 `data` 字段；前端取 `res.data.data`。

---

## 3. POST /api/projects/:id/seed/part

请求体：
```json
{
  "part": "characters",            // 'brief' | 'outline' | 'characters'
  "prompt": "为本书补充若干贴合世界观的新角色",
  "context": {                      // 保证与现有设定自洽（可省略，前端已自动构造）
    "brief": { "genre": "科幻", "worldview": "…", "sections": [...] },
    "existingCharacterIds": ["char-1", "char-2"],
    "outlineSummary": "第一卷/第一章/钩子、转折…"
  }
}
```

响应（200）：`{ "data": { "characters": [...] } }` —— **仅含请求的 `part` 一项**。

前端 `generatePart` 在未传 `context` 时，会自动用 `buildSeedContext(projectId)` 构造（当前 brief + 已有角色 id + 大纲摘要）后发送。

---

## 4. POST /api/projects/:id/seed/stream（可选 SSE）

后端 seed 子图改走流式，分步产出。事件形状（`text/event-stream`，每行 `data: {json}`）：

```
data: {"type":"part","part":"brief","data":{...SeedBrief}}
data: {"type":"part","part":"outline","data":{...SeedOutline}}
data: {"type":"part","part":"characters","data":[...SeedCharacter]}
data: {"type":"done"}
```

前端 `streamSeed` 已预留 reader：收到 `part` 事件即调用 `applySeed` 增量回填（边收边写，避免整包等待）。

---

## 5. 前端回填与增量合并（origin 机制）

数据单元带来源标记 `Origin = 'seed' | 'user' | 'init'`：
- `seed`：种子生成、用户未手动改 → 下次种子可覆盖。
- `user` / `init`：用户手动改或自建 → 种子回填**跳过、原地保留**。

合并粒度：
- Brief：平铺字段级（`fieldOrigins`）+ sections 按 id。
- Outline / Characters：按 id 级。

> 后端无需感知 origin——它只返回完整快照 JSON，冲突归并完全在前端 `mergeBrief/mergeOutline/mergeCharacters` 完成（前端本地优先，再经 syncManager 推后端）。

---

## 6. 失败处理

- 后端失败 / 网络错误：前端 `fetchSeed` 捕获后回退本地 `mockSeed`（占位结构化产出），回填逻辑不变。
- 部分成功：`applySeed` 对每项做存在性判断，缺失项不报错。

---

## 7. 测试数据（mock 后端响应样例）

见 `src/test/seedApiContract.test.ts` 的 `backendSeedResponse()`：返回标准 `ProjectSeed` JSON（id 带 `b-` 前缀区分后端生成），验证前端解析 + 回填 + 增量合并 + 失败回退。
