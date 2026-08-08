"""公共门控服务：把"拦截-审批-执行"的写操作门控从 Agent 图状态机中抽离为独立服务。

设计要点：
- 与执行解耦的"写操作"注册表：工具名/入参映射到写操作键（operation key）。
- 无状态能力：判断某次调用是否需门控、生成审批卡预览、按用户决策真正执行。
- 暂存（deferred mutation）归属各调用方：Agent 图用 LangGraph checkpoint（pending_tool），
  REST 等无会话场景用 PendingChangeStore（Redis）。本服务自身不持有持久化，
  因此 Agent、workflow、REST 三处可共用同一套审批逻辑与卡片契约。
"""
import json
import uuid

from config.logging import get_logger

logger = get_logger(__name__)


# 写操作键：与具体工具名解耦，便于 workflow / REST 复用同一套审批
OP_CHAPTER_WRITE = "chapter.write"
OP_CHAPTER_EDIT = "chapter.edit"
OP_CHAPTER_DIFF = "chapter.diff"
OP_ENTITY_CREATE = "entity.create"
OP_ENTITY_UPDATE = "entity.update"
OP_OUTLINE_CREATE = "outline.create"
OP_MEMORY_WRITE = "memory.write"


# 工具名 → 写操作键（manage_memory 需按 mode 二次判断）
# 注意：write_workflow_candidate 不入 gating——用户选定候选节点本身就是确认，
# 无需再弹审核卡，否则「选节点→再确认一次」造成多章生成时每次多一步。
_TOOL_OP = {
    "write_chapter_content": OP_CHAPTER_WRITE,
    "edit_chapter_content": OP_CHAPTER_EDIT,
    "apply_chapter_diff": OP_CHAPTER_DIFF,
    "create_entities": OP_ENTITY_CREATE,
    "update_entity": OP_ENTITY_UPDATE,
    "create_outline": OP_OUTLINE_CREATE,
}

# 审批时支持"编辑后采纳"的操作（其入参含可直接覆盖的 content 字段）
_EDITABLE_OPS = {OP_CHAPTER_WRITE}

# 所有写操作默认都需审批；如需对某些操作放开，可在此置 False
_OP_GATED = {
    OP_CHAPTER_WRITE: True,
    OP_CHAPTER_EDIT: True,
    OP_CHAPTER_DIFF: True,
    OP_ENTITY_CREATE: True,
    OP_ENTITY_UPDATE: True,
    OP_OUTLINE_CREATE: True,
    OP_MEMORY_WRITE: True,
}


def resolve_operation(tool_name: str, args: dict | None) -> str | None:
    """把一次工具调用映射到写操作键；非写操作返回 None。

    Args:
        tool_name: 工具名。
        args: 工具入参。

    Returns:
        写操作键；非写操作返回 None。
    """
    if tool_name == "manage_memory":
        mode = (args or {}).get("mode")
        if mode in ("save", "update", "forget"):
            return OP_MEMORY_WRITE
        return None
    return _TOOL_OP.get(tool_name)


def is_gated(tool_name: str, args: dict | None) -> bool:
    """判断某次工具调用是否需要用户审批。

    Args:
        tool_name: 工具名。
        args: 工具入参。

    Returns:
        是否需要拦截等待用户确认。
    """
    op = resolve_operation(tool_name, args)
    if op is None:
        return False
    return _OP_GATED.get(op, False)


def build_preview(operation: str, tool_name: str, args: dict) -> dict:
    """生成审批卡字段（与前端 ReviewCard 契约一致：node_id/node_label/output_preview/reason/system_prompt）。

    Args:
        operation: 写操作键（预留，便于未来按操作定制预览）。
        tool_name: 工具名。
        args: 工具入参。

    Returns:
        可直接作为 review_card 负载的字典。
    """
    if tool_name in ("write_chapter_content", "edit_chapter_content"):
        content = args.get("content") or args.get("new_text") or ""
        preview = f"章节ID={args.get('chapter_id')}\n{content[:800]}"
    elif tool_name == "write_workflow_candidate":
        preview = f"章节ID={args.get('chapter_id')} 候选节点={args.get('node_id')}（从工作流结果写入，正文不在此预览）"
    elif tool_name == "apply_chapter_diff":
        preview = f"章节ID={args.get('chapter_id')}\n{args.get('unified_diff', '')[:800]}"
    elif tool_name == "create_entities":
        parts: list[str] = []
        for k in ("characters", "locations", "scene_events", "foreshadowings", "plot_threads"):
            v = args.get(k)
            if isinstance(v, list) and v:
                parts.append(f"{k}: {len(v)} 项")
        if args.get("source_text"):
            parts.append(f"source_text: {len(args['source_text'])} 字")
        preview = "；".join(parts) or "（无具体内容预览）"
    elif tool_name == "update_entity":
        preview = f"kind={args.get('kind')} item_id={args.get('item_id')}\n{json.dumps(args.get('data', {}), ensure_ascii=False)[:800]}"
    elif tool_name == "create_outline":
        preview = f"mode={args.get('mode')} title={args.get('title')}\nsummary={args.get('summary')}"
    elif tool_name == "manage_memory":
        preview = f"mode={args.get('mode')}\n{str(args.get('content', ''))[:800]}"
    else:
        preview = json.dumps(args, ensure_ascii=False)[:800]
    return {
        "node_id": tool_name,
        "node_label": f"工具调用：{tool_name}",
        "output_preview": preview,
        "reason": "该操作会修改书籍数据，需你确认后才会执行",
        "system_prompt": "",
    }


class GatingService:
    """无状态门控服务：负责真正执行被审批的写操作。

    暂存（deferred）由各调用方负责：Agent 图存在 checkpoint 的 pending_tool，
    REST 等场景可用 PendingChangeStore。本服务只关心"按决策执行"。
    """

    def __init__(self, session_factory, model_config: dict | None = None):
        self._session_factory = session_factory
        self._model_config = model_config

    async def _invoke(self, tool_name: str, args: dict) -> dict:
        """安全调用工具，捕获异常转为结构化错误，避免门控节点因工具报错而崩溃。"""
        from ..agent.tools_domain import build_tools

        tools = {t.name: t for t in build_tools(self._session_factory, model_config=self._model_config)}
        tool = tools.get(tool_name)
        if not tool:
            return {"error": f"工具不存在: {tool_name}"}
        try:
            return await tool.ainvoke(args)
        except Exception as exc:
            logger.error(f"[GatingService] 工具 {tool_name} 执行失败: {exc}", exc_info=True)
            # 缺参类错误：给出可操作提示，帮助模型下一轮直接取对参数，
            # 避免「漏参 → 报错 → 空转重试」死循环（尤其 read/write_chapter_content）。
            try:
                from pydantic import ValidationError

                if isinstance(exc, ValidationError):
                    missing = [f"「{e.get('loc', ['?'])[-1]}」" for e in exc.errors() if e.get("type") == "missing"]
                    hint = f"工具 {tool_name} 缺少必填参数：{'、'.join(missing) or '未知字段'}。请直接给出这些参数的具体值，不要再猜测。"
                    if "chapter_id" in str(exc) and args.get("book_id"):
                        # 附带当前书籍可用章节清单，让模型直接抄对 chapter_id
                        try:
                            from sqlalchemy import select

                            from models.book import Chapter, Volume

                            async with self._session_factory() as _s:
                                rows = (await _s.execute(
                                    select(Chapter.id, Chapter.title)
                                    .join(Volume, Volume.id == Chapter.volume_id)
                                    .where(Volume.book_id == args["book_id"])
                                    .order_by(Chapter.sort_order, Chapter.id)
                                )).all()
                            if rows:
                                chapter_list = "；".join(f"{cid}({title})" for cid, title in rows[:20])
                                hint += f"\n当前书籍可用章节（chapter_id 从这些里选）：{chapter_list}"
                        except Exception:
                            pass
                    return {"error": hint}
            except ImportError:
                pass
            return {"error": f"工具执行失败: {exc}"}

    async def invoke(self, tool_name: str, args: dict) -> dict:
        """立即执行（非门控或已审批的）工具。供门控节点执行非写工具复用。"""
        return await self._invoke(tool_name, args)

    async def apply(
        self,
        operation: str,
        tool_name: str,
        args: dict,
        decision: str,
        edited_content: str | None = None,
        tool_call_id: str = "",
    ) -> dict:
        """按用户决策执行被拦截的写操作。

        Args:
            operation: 写操作键（resolve_operation 的结果）。
            tool_name: 工具名。
            args: 原始入参。
            decision: accept / retry / edit / terminate。
            edited_content: edit 决策下的用户修改内容（仅可编辑操作生效）。
            tool_call_id: 回写 ToolMessage 用的 id。

        Returns:
            工具执行结果；terminate 时返回取消标记。
        """
        if decision == "terminate":
            return {"cancelled": True, "tool": tool_name, "detail": "用户取消本次修改"}
        effective_args = dict(args)
        if decision == "edit" and edited_content is not None and operation in _EDITABLE_OPS:
            effective_args["content"] = edited_content
        return await self._invoke(tool_name, effective_args)


class PendingChangeStore:
    """为非 Agent（无 checkpoint）场景提供被拦截写操作的暂存（Redis 键：gating:<request_id>）。

    Agent 图自带 checkpoint，无需此存储；本类让 REST 等接口也能复用 GatingService 的审批流。
    """

    def __init__(self, ttl: int = 3600):
        self._ttl = ttl

    async def save(self, tool_name: str, args: dict, user_id: int, book_id: int) -> str:
        """暂存一次被拦截的写操作，返回 request_id。"""
        from shared.redis import redis_client

        request_id = uuid.uuid4().hex
        payload = {"tool_name": tool_name, "args": args, "user_id": user_id, "book_id": book_id}
        try:
            await redis_client.setex(f"gating:{request_id}", self._ttl, json.dumps(payload, ensure_ascii=False))
        except Exception as exc:
            logger.warning(f"[PendingChangeStore] 写入失败: {exc}")
        return request_id

    async def load(self, request_id: str) -> dict | None:
        """读取暂存的写操作；不存在或读取失败返回 None。"""
        from shared.redis import redis_client

        try:
            raw = await redis_client.get(f"gating:{request_id}")
        except Exception as exc:
            logger.warning(f"[PendingChangeStore] 读取失败: {exc}")
            return None
        return json.loads(raw) if raw else None

    async def delete(self, request_id: str) -> None:
        """删除暂存的写操作。"""
        from shared.redis import redis_client

        try:
            await redis_client.delete(f"gating:{request_id}")
        except Exception as exc:
            logger.warning(f"[PendingChangeStore] 删除失败: {exc}")
