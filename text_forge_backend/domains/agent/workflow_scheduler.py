from collections import deque
from collections.abc import Callable
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langgraph.config import get_stream_writer
from sqlalchemy.ext.asyncio import AsyncSession

from config.logging import get_logger
from core.model_factory import ModelFactory
from domains.book.context_config_repository import BookContextConfigRepository
from domains.book.structured_repository import StructuredRepository
from shared.database import db_manager

logger = get_logger(__name__)


class WorkflowCycleError(ValueError):
    """工作流存在循环依赖时抛出。"""


CONTEXT_FIELD_MAP = {
    "input_summary": "input_summary",
    "input_worldview": "input_worldview",
    "input_brief_summary": "input_brief_summary",
    "input_characters": "input_characters",
    "input_recent_chapters": "input_recent_chapters",
    "input_outline": "input_outline",
}


KEYWORD_CONTEXT_MAP = {
    "book_info": ["书名", "简介", "书籍信息"],
    "characters": ["角色", "人物", "人设", "主角", "配角"],
    "outline_structure": ["大纲", "章节", "卷"],
    "locations": ["地点", "场景", "地理"],
    "scene_events": ["事件", "情节", "时间线"],
    "foreshadowings": ["伏笔"],
    "plot_threads": ["线索", "情节线"],
    "creative_settings": ["世界观", "设定", "文风", "基调"],
    "chapter_summaries": ["摘要", "章"],
    "recent_chapters": ["近期", "前文"],
}


def topological_sort(
    nodes: list[dict[str, Any]],
    edges: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """对工作流节点进行拓扑排序。

    无 edges 时默认按 nodes 数组顺序线性执行。

    Args:
        nodes: 节点列表，每个节点含 id 字段。
        edges: 边列表，每个边含 from / to 字段。

    Returns:
        排序后的节点列表。

    Raises:
        WorkflowCycleError: 存在循环依赖时抛出。
    """
    if not edges:
        return list(nodes)

    in_degree: dict[str, int] = {n["id"]: 0 for n in nodes}
    graph: dict[str, list[str]] = {n["id"]: [] for n in nodes}

    for e in edges:
        src = e.get("from")
        dst = e.get("to")
        if src in graph and dst in graph:
            graph[src].append(dst)
            in_degree[dst] += 1

    queue = deque([nid for nid, deg in in_degree.items() if deg == 0])
    sorted_nodes: list[dict[str, Any]] = []
    while queue:
        nid = queue.popleft()
        matching = [n for n in nodes if n["id"] == nid]
        if matching:
            sorted_nodes.append(matching[0])
        for neighbor in graph[nid]:
            in_degree[neighbor] -= 1
            if in_degree[neighbor] == 0:
                queue.append(neighbor)

    if len(sorted_nodes) != len(nodes):
        raise WorkflowCycleError("工作流存在循环依赖")
    return sorted_nodes


def auto_allocate_context(system_prompt: str) -> list[str]:
    """根据 system_prompt 关键词自动匹配上下文字段。

    Args:
        system_prompt: 节点的系统提示词。

    Returns:
        推荐的上下文字段列表。
    """
    fields: set[str] = {"book_info"}
    for field, keywords in KEYWORD_CONTEXT_MAP.items():
        if any(kw in system_prompt for kw in keywords):
            fields.add(field)
    return list(fields)


async def _load_context_pool(book_id: int) -> dict[str, list[int]]:
    """加载书籍上下文池。

    Args:
        book_id: 书籍 ID。

    Returns:
        上下文字段映射字典。
    """
    if not book_id:
        return {}
    async with db_manager.with_db() as session:
        repo = BookContextConfigRepository(session)
        return await repo.get_config(book_id)


def _to_serializable(value):
    """将值转换为可 JSON 序列化的格式。"""
    if isinstance(value, (str, int, float, bool, type(None))):
        return value
    if isinstance(value, dict):
        return {k: _to_serializable(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_to_serializable(v) for v in value]
    return str(value)


def _format_context_field(
    field: str, records: list, include_chapter_title: bool = True
) -> str:
    """将结构化查询结果格式化为 prompt 可读文本。

    内联自原 context_formatter.py + tool_node.py 的格式化逻辑。

    Args:
        field: 上下文字段名。
        records: 记录列表。
        include_chapter_title: 章节正文是否包含标题。

    Returns:
        格式化后的文本。
    """
    if field == "book_info":
        lines = []
        for r in records:
            title = getattr(r, "title", "") or ""
            desc = getattr(r, "description", "") or ""
            genre = getattr(r, "genre", "") or ""
            lines.append(f"《{title}》类型：{genre}\n描述：{desc[:300]}")
        return "\n".join(lines)

    if field == "setting":
        lines = []
        for r in records:
            w = getattr(r, "worldview", "") or ""
            t = getattr(r, "tone", "") or ""
            wt = getattr(r, "writing_taboos", "") or ""
            cd = getattr(r, "custom_dimensions", None) or {}
            if w:
                lines.append(f"# 世界观\n{w}")
            if t:
                lines.append(f"# 文风/基调\n{t}")
            if wt:
                lines.append(f"# 创作禁忌\n{wt}")
            if cd:
                for k, v in cd.items():
                    if isinstance(v, (str, int, float)):
                        lines.append(f"{k}：{v}")
                    elif isinstance(v, list):
                        lines.append(f"{k}：{', '.join(str(x) for x in v)}")
                    else:
                        lines.append(f"{k}：{v!s}")
        return "\n\n".join(lines)

    if field == "characters":
        lines = []
        for r in records:
            name = getattr(r, "name", "未知")
            desc = getattr(r, "description", "") or ""
            role = getattr(r, "role_type", "") or ""
            status = getattr(r, "status", "") or ""
            line = f"- {name}（{role}）：{desc[:200]}"
            if status:
                line += f" [状态：{status}]"
            lines.append(line)
        return "角色设定\n" + "\n".join(lines)

    if field == "character_relationships":
        lines = []
        for r in records:
            name = getattr(r, "name", "未知")
            rels = getattr(r, "relationship_chain", None) or []
            rel_texts = []
            for rel in rels[:8]:
                target = getattr(rel, "target", "") or ""
                relation = getattr(rel, "relation", "") or ""
                if target and relation:
                    rel_texts.append(f"{target}（{relation}）")
            if rel_texts:
                lines.append(f"- {name}：{'；'.join(rel_texts)}")
            else:
                lines.append(f"- {name}：无关系数据")
        return "\n".join(lines)

    if field == "chapter_content":
        blocks = []
        for r in records:
            content = getattr(r, "content", "") or ""
            if include_chapter_title:
                title = getattr(r, "chapter", {}).title if hasattr(r, "chapter") else ""
                blocks.append(f"# {title}\n{content[:3000]}")
            else:
                blocks.append(content[:3000])
        return "\n\n".join(blocks)

    if field == "chapter_summaries":
        lines = []
        for r in records:
            title = getattr(r, "title", "未命名")
            summary = getattr(r, "summary", "") or ""
            lines.append(f"- {title}：{summary}")
        return "\n".join(lines)

    if field == "recent_chapters":
        blocks = []
        for r in records:
            title = getattr(r, "title", "未命名")
            summary = getattr(r, "summary", "") or ""
            content = getattr(r, "content", "") or ""
            block = f"# {title}"
            if summary:
                block += f"\n{summary}"
            if content:
                block += f"\n{content[:3000]}"
            blocks.append(block)
        return "\n\n".join(blocks)

    if field == "outline_structure":
        lines = []
        for r in records:
            node_type = getattr(r, "node_type", "")
            title = getattr(r, "title", "未命名")
            content = getattr(r, "content", "") or ""
            lines.append(f"- [{node_type}] {title}：{content[:500]}")
        return "\n".join(lines)

    if field == "volumes":
        lines = []
        for r in records:
            title = getattr(r, "title", "未命名")
            summary = getattr(r, "summary", "") or ""
            lines.append(f"- {title}：{summary[:500]}")
        return "\n".join(lines)

    if field == "scene_events":
        lines = []
        for r in records:
            name = getattr(r, "name", "未命名")
            desc = getattr(r, "description", "") or ""
            ev_type = getattr(r, "event_type", "") or ""
            lines.append(f"- [{ev_type}] {name}：{desc[:300]}")
        return "\n".join(lines)

    if field == "foreshadowings":
        lines = []
        for r in records:
            desc = getattr(r, "description", "") or ""
            status = getattr(r, "status", "") or ""
            lines.append(f"- [{status}] {desc[:300]}")
        return "\n".join(lines)

    if field == "plot_threads":
        lines = []
        for r in records:
            name = getattr(r, "name", "未命名")
            desc = getattr(r, "description", "") or ""
            status = getattr(r, "status", "") or ""
            lines.append(f"- [{status}] {name}：{desc[:300]}")
        return "\n".join(lines)

    if field == "creative_settings":
        lines = []
        for r in records:
            tone = getattr(r, "tone", "") or ""
            worldview = getattr(r, "worldview", "") or ""
            taboos = getattr(r, "writing_taboos", "") or ""
            if tone:
                lines.append(f"文风：{tone[:500]}")
            if worldview:
                lines.append(f"世界观：{worldview[:500]}")
            if taboos:
                lines.append(f"写作禁忌：{taboos[:500]}")
        return "\n".join(lines)

    return ""


async def _query_structured_context(
    session: AsyncSession,
    book_id: int,
    context_fields: list[str],
    context_pool: dict[str, list[int]] | None = None,
) -> dict[str, Any]:
    """查询结构化上下文数据（复用 StructuredRepository）。

    Args:
        session: 数据库会话。
        book_id: 书籍 ID。
        context_fields: 需要查询的上下文字段列表。
        context_pool: 上下文池配置。

    Returns:
        按字段名组织的记录字典。
    """
    if not context_fields or not book_id:
        return {}
    try:
        repo = StructuredRepository(session)
        return await repo.query_by_fields(
            book_id=book_id,
            context_fields=context_fields,
            context_pool=context_pool or {},
        )
    except Exception as exc:
        logger.warning(f"_query_structured_context 失败: {exc}")
        return {}


async def audit_node_output(
    output: str,
    system_prompt: str,
    model_config: dict,
) -> dict[str, Any]:
    """使用 audit 模型检查节点输出质量。

    Args:
        output: 节点输出文本。
        system_prompt: 节点的系统提示词（含写作要求）。
        model_config: 模型配置。

    Returns:
        {"passed": bool, "reason": str}
    """
    if not output.strip() or len(output) < 50:
        return {"passed": True}

    try:
        llm = ModelFactory(model_config)
        quality_prompt = (
            f"请判断以下创作输出是否符合角色节点的写作要求。\n\n"
            f"【角色节点要求】\n{system_prompt[:1500]}\n\n"
            f"【创作输出】\n{output[:3000]}\n\n"
            f"输出是否严格遵循了上述写作要求？只回答 PASS 或 FAIL，然后简要说明理由。"
        )
        quality_response = await llm.audit.ainvoke(quality_prompt)
        quality_text = quality_response.content if hasattr(quality_response, "content") else str(quality_response)

        if quality_text.strip().upper().startswith("FAIL") or "不合格" in quality_text:
            return {"passed": False, "reason": quality_text.strip()[:500]}
        return {"passed": True}
    except Exception:
        logger.exception("audit_node_output 失败，默认通过")
        return {"passed": True}


def _format_prompt_context(
    structured: dict[str, Any],
    personal_rag_results: list[dict] | None = None,
    upstream_outputs: dict[str, str] | None = None,
) -> str:
    """将上下文组装为 prompt 文本。

    Args:
        structured: 结构化上下文（StructuredRepository 返回的原始结果）。
        personal_rag_results: 前端写入的 RAG 检索结果。
        upstream_outputs: 上游节点输出 {node_id: output}。

    Returns:
        格式化的上下文字符串。
    """
    parts = []

    if upstream_outputs:
        for uid, text in upstream_outputs.items():
            if len(text) > 3000:
                truncated = text[:3000] + "\n…（已截断，完整输出可在节点详情中查看）"
            else:
                truncated = text
            parts.append(f"[上游节点 {uid} 输出]\n{truncated}")

    if structured:
        for field_name, records in structured.items():
            if not records:
                continue
            display_name = {
                "book_info": "书籍基本信息",
                "setting": "创作设定",
                "characters": "角色档案",
                "character_relationships": "角色关系",
                "chapter_content": "章节正文",
                "chapter_summaries": "章节摘要",
                "recent_chapters": "最近章节",
                "outline_structure": "大纲结构",
                "volumes": "卷信息",
                "scene_events": "场景事件",
                "foreshadowings": "伏笔列表",
                "plot_threads": "剧情线索",
                "creative_settings": "创意设定",
            }.get(field_name, field_name)
            parts.append(f"## {display_name}（共 {len(records)} 条）")
            for rec in records[:10]:
                text = _format_context_field(field_name, [rec])
                if text:
                    parts.append(text)
            if len(records) > 10:
                parts.append(f"... 还有 {len(records) - 10} 条")

    if personal_rag_results:
        parts.append("\n## 个人知识库检索结果")
        for item in personal_rag_results:
            doc_name = item.get("doc_name", item.get("doc_title", ""))
            content = item.get("content", "")[:500]
            score = item.get("score", 0)
            parts.append(f"[{doc_name}]（相关度：{score:.1%}）\n{content}")

    return "\n\n".join(parts) if parts else "（无上下文）"


async def execute_node(
    node_def: dict[str, Any],
    book_id: int,
    upstream_outputs: dict[str, str] | None = None,
    model_config: dict | None = None,
    personal_rag_results: list[dict] | None = None,
    on_token: Callable[[str], None] | None = None,
    node_id: str = "",
    on_progress: Callable[[dict[str, Any]], None] | None = None,
) -> dict[str, Any]:
    """执行单个工作流节点。

    Args:
        node_def: 节点定义（含 system_prompt / executor / context_fields 等）。
        book_id: 书籍 ID。
        upstream_outputs: 上游节点输出 {node_id: output}。
        model_config: 模型配置。
        personal_rag_results: 前端写入的个人 RAG 检索结果。
        on_token: 流式输出回调。

    Returns:
        {"success": bool, "output": str, "needs_review": bool, "quality_check": dict, "tokens": int}
    """
    system_prompt = node_def.get("system_prompt", "")
    executor_type = node_def.get("executor") or "main"
    context_fields = node_def.get("context_fields") or []

    if not context_fields and system_prompt:
        context_fields = auto_allocate_context(system_prompt)

    structured = {}
    if book_id and context_fields:
        context_pool = await _load_context_pool(book_id)
        async with db_manager.with_db() as session:
            structured = await _query_structured_context(
                session, book_id, context_fields, context_pool
            )

    context_text = _format_prompt_context(
        structured, personal_rag_results, upstream_outputs
    )

    llm = ModelFactory(model_config or {})

    if executor_type == "audit":
        model = llm.audit
    else:
        model = llm.main

    messages = [
        SystemMessage(content=system_prompt or "你是一个专业的创作AI。根据上下文生成内容。直接输出创作内容，不要多余解释。"),
        HumanMessage(content=f"项目上下文\n{context_text}\n\n请根据上述上下文和你的角色职责开始创作。"),
    ]

    full_content = ""
    token_count = 0
    try:
        stream_writer = get_stream_writer()
    except Exception:
        stream_writer = None
    try:
        if on_progress:
            on_progress({
                "event": "node_start",
                "node_id": node_id,
                "label": node_def.get("label") or node_def.get("name") or node_id,
            })
        if stream_writer is not None:
            try:
                stream_writer({
                    "event": "node_start",
                    "node_id": node_id,
                    "label": node_def.get("label") or node_def.get("name") or node_id,
                })
            except Exception:
                pass
        async for chunk in model.astream(messages):
            token = chunk.content if hasattr(chunk, "content") else str(chunk)
            if token:
                full_content += token
                token_count += 1
                if on_token:
                    on_token(token)
                if on_progress:
                    on_progress({
                        "event": "node_stream",
                        "node_id": node_id,
                        "token": token,
                        "index": token_count,
                    })
                if stream_writer is not None:
                    try:
                        stream_writer({
                            "event": "node_stream",
                            "node_id": node_id,
                            "token": token,
                            "index": token_count,
                        })
                    except Exception:
                        pass
    except Exception:
        logger.exception("execute_node LLM 调用失败")
        return {
            "success": False,
            "output": "",
            "needs_review": False,
            "quality_check": {"passed": False, "reason": "LLM 调用失败"},
            "tokens": 0,
        }

    if not full_content.strip():
        return {
            "success": False,
            "output": "",
            "needs_review": False,
            "quality_check": {"passed": False, "reason": "输出为空"},
            "tokens": 0,
        }

    if len(full_content) > 8000:
        full_content = full_content[:3000] + "\n…（中间省略）…\n" + full_content[-2000:]

    qc = await audit_node_output(full_content, system_prompt, model_config or {})
    needs_review = not qc.get("passed", True)

    if on_progress:
        on_progress({
            "event": "node_end",
            "node_id": node_id,
            "output_preview": full_content[:500],
            "tokens": token_count,
        })
    if stream_writer is not None:
        try:
            stream_writer({
                "event": "node_end",
                "node_id": node_id,
                "output_preview": full_content[:500],
                "tokens": token_count,
            })
        except Exception:
            pass

    return {
        "success": True,
        "output": full_content,
        "needs_review": needs_review,
        "quality_check": qc,
        "tokens": token_count,
    }


async def run_workflow(
    workflow_id: str,
    book_id: int,
    model_config: dict,
    on_progress: Callable[[dict[str, Any]], None],
    personal_rag_results: list[dict] | None = None,
    node_id: str = "",
) -> dict[str, Any]:
    """执行完整工作流，按拓扑顺序逐个执行节点。

    Args:
        workflow_id: 工作流 ID。
        book_id: 书籍 ID。
        model_config: 模型配置。
        on_progress: 进度回调，每节点开始时/完成时调用。
        personal_rag_results: 前端写入的个人 RAG 检索结果。

    Returns:
        {"status": "completed"/"pending_review"/"error", "node_results": [...], ...}
    """
    from sqlalchemy import select

    from models.workflow import Workflow

    async with db_manager.with_db() as session:
        wf_stmt = select(Workflow).where(Workflow.id == workflow_id)
        wf_result = await session.execute(wf_stmt)
        workflow = wf_result.scalar_one_or_none()

    if not workflow:
        return {"status": "error", "message": f"工作流不存在: {workflow_id}"}

    nodes = list(workflow.nodes or [])
    edges = list(workflow.edges or [])

    if not nodes:
        return {"status": "error", "message": "该工作流无节点，请编辑工作流定义"}

    if not book_id:
        return {"status": "error", "message": "未选择活动书籍"}

    try:
        sorted_nodes = topological_sort(nodes, edges)
    except WorkflowCycleError:
        return {"status": "error", "message": "工作流存在循环依赖"}

    node_results: list[dict[str, Any]] = []
    upstream_outputs: dict[str, str] = {}

    for node in sorted_nodes:
        node_id = node.get("id", "")
        node_label = node.get("label") or node.get("name") or node_id

        on_progress({
            "event": "node_start",
            "node_id": node_id,
            "label": node_label,
        })

        if edges:
            predecessors = [e["from"] for e in edges if e.get("to") == node_id]
            node_upstream = {
                dep: upstream_outputs[dep]
                for dep in predecessors
                if dep in upstream_outputs
            }
        else:
            node_upstream = dict(upstream_outputs)

        result = await execute_node(
            node_def=node,
            book_id=book_id,
            upstream_outputs=node_upstream,
            model_config=model_config,
            personal_rag_results=personal_rag_results,
            node_id=node_id,
            on_progress=on_progress,
        )

        if result.get("needs_review"):
            on_progress({
                "event": "node_fail",
                "node_id": node_id,
                "label": node_label,
                "reason": result.get("quality_check", {}).get("reason", ""),
                "output_preview": result.get("output", "")[:1000],
                "system_prompt": node.get("system_prompt", "")[:500],
            })
            node_results.append({
                "node_id": node_id,
                "node_label": node_label,
                "output": result["output"],
                "status": "fail",
                "quality_check": result.get("quality_check"),
            })
            return {
                "status": "pending_review",
                "node_results": node_results,
                "pending_node_id": node_id,
                "pending_node_label": node_label,
            }

        upstream_outputs[node_id] = result["output"]
        on_progress({
            "event": "node_end",
            "node_id": node_id,
            "label": node_label,
            "output_preview": result["output"][:500],
            "tokens": result.get("tokens", 0),
        })
        node_results.append({
            "node_id": node_id,
            "node_label": node_label,
            "output": result["output"],
            "status": "completed",
            "tokens": result.get("tokens", 0),
        })

    return {
        "status": "completed",
        "node_results": node_results,
        "upstream_outputs": upstream_outputs,
    }
