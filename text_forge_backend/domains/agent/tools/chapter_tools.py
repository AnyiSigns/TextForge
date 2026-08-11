import re
from typing import Annotated

from config.logging import get_logger
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from models.book import Chapter, ChapterContent, Volume
from sqlalchemy import func, select

logger = get_logger(__name__)


def _apply_unified_diff(old_text: str, diff_text: str) -> str:
    """把标准 unified diff 应用到 old_text 上，返回新文本。

    仅解析以 @@ 开头的 hunk；上下文行(' ')、删除行('-')、新增行('+')按规则重建。
    不支持二进制补丁或带 rename 的 diff。hunk 越界或与正文不匹配时抛 ValueError。

    Args:
        old_text: 当前正文。
        diff_text: 标准 unified diff 文本（含 @@ hunk 头）。

    Returns:
        应用 diff 后的新文本。
    """
    old_lines = old_text.split("\n")
    hunks: list[dict] = []
    cur: dict | None = None
    for raw in diff_text.split("\n"):
        if raw.startswith("@@"):
            m = re.match(r"@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@", raw)
            if not m:
                continue
            cur = {"old_start": int(m.group(1)), "ops": []}
            hunks.append(cur)
        elif cur is not None and raw and raw[0] in ("+", "-", " "):
            cur["ops"].append((raw[0], raw[1:]))
        # 其余行（如 --- / +++ 文件头、空行）忽略
    result = list(old_lines)
    offset = 0
    for h in hunks:
        old_count = sum(1 for k, _ in h["ops"] if k in ("-", " "))
        new_lines = [t for k, t in h["ops"] if k in ("+", " ")]
        base = h["old_start"] - 1 + offset
        if base < 0 or base + old_count > len(result):
            raise ValueError(f"diff 位置越界（hunk 起始行 {h['old_start']}），可能不匹配当前正文")
        result[base:base + old_count] = new_lines
        offset += len(new_lines) - old_count
    return "\n".join(result)


async def _append_chapter_content_version(
    session, chapter_id: int, content: str
):
    """追加章节内容新版本（version = 最新 + 1），并发撞号时自动重试一次。

    在 (chapter_id, version) 唯一约束下，两个并发写入同时计算 max+1 时，
    后提交的一方会触发 IntegrityError；捕获后回滚并重算版本号重试，
    避免 500 与重复版本。

    Args:
        session: 数据库会话。
        chapter_id: 章节 ID。
        content: 正文内容。

    Returns:
        新创建的 ChapterContent 实例。
    """
    from sqlalchemy.exc import IntegrityError

    for attempt in range(2):
        max_ver = (
            await session.execute(
                select(func.max(ChapterContent.version)).where(
                    ChapterContent.chapter_id == chapter_id
                )
            )
        ).scalar() or 0
        new_content = ChapterContent(
            chapter_id=chapter_id, content=content, version=max_ver + 1
        )
        session.add(new_content)
        try:
            await session.commit()
            return new_content
        except IntegrityError:
            await session.rollback()
            if attempt == 0:
                continue
            raise
    raise RuntimeError("追加章节版本失败")  # pragma: no cover


def _build_chapter_tools(session_factory):
    @tool
    async def read_chapter_content(
        chapter_id: Annotated[int | None, "章节ID（与 chapter_ids 二选一）"] = None,
        chapter_ids: Annotated[list | None, "批量读取的章节ID列表（与 chapter_id 二选一，drafting 并行读多章时用）"] = None,
        version: Annotated[int | None, "指定版本号，缺省取最新版本"] = None,
        max_chars: Annotated[int, "返回内容的最大字符数"] = 8000,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """读取章节正文内容（缺省最新版本）。传 chapter_ids 时批量读取多章，返回 {chapters: [...]}。

        归属校验：正文必须属于当前 active_book_id 的卷下，跨书章节一律返回「暂无正文」
        （不泄露存在性），防止批量参数被用来枚举其他书籍的章节正文。
        """
        logger.debug(f"[tool] read_chapter_content  chapter_id={chapter_id}  chapter_ids={chapter_ids}  book_id={book_id}")
        ids = list(chapter_ids or []) if chapter_ids else ([chapter_id] if chapter_id else [])
        if not ids:
            return {"error": "请传入 chapter_id 或 chapter_ids"}

        def _format(content: ChapterContent | None, cid: int) -> dict:
            if content is None:
                # 无正文（或不属于当前书）时返回正常结构而非 error，避免被 quality_gate
                # 计为工具失败、诱发模型无谓的空转重试；Agent 据此应改用 write_chapter_content 落库。
                return {
                    "chapter_id": cid, "version": 0,
                    "word_count": 0, "truncated": False,
                    "content": "", "note": "该章节暂无正文（工作流生成的内容尚未落库），如需要保存请调用 write_chapter_content 写入。",
                }
            text = content.content or ""
            truncated = len(text) > max_chars
            return {
                "chapter_id": cid, "version": content.version,
                "word_count": len(text), "truncated": truncated,
                "content": text[:max_chars] if truncated else text,
            }

        async with session_factory() as session:
            if len(ids) == 1:
                stmt = (
                    select(ChapterContent)
                    .join(Chapter, Chapter.id == ChapterContent.chapter_id)
                    .join(Volume, Volume.id == Chapter.volume_id)
                    .where(ChapterContent.chapter_id == ids[0], Volume.book_id == book_id)
                )
                if version is not None:
                    stmt = stmt.where(ChapterContent.version == version)
                stmt = stmt.order_by(ChapterContent.version.desc()).limit(1)
                content = (await session.execute(stmt)).scalar_one_or_none()
                return _format(content, ids[0])
            # 批量：单条 IN 查询 + Postgres DISTINCT ON 只取各章最新版本一次
            # （不把所有历史版本整行取回再丢弃，避免版本越改越多时传输/ORM 成本线性上涨），
            # 且尊重 version 参数（缺省取最新，指定则取该版本）。
            stmt = (
                select(ChapterContent)
                .join(Chapter, Chapter.id == ChapterContent.chapter_id)
                .join(Volume, Volume.id == Chapter.volume_id)
                .where(ChapterContent.chapter_id.in_(ids), Volume.book_id == book_id)
                .distinct(ChapterContent.chapter_id)
                .order_by(
                    ChapterContent.chapter_id,
                    ChapterContent.version.desc(),
                )
            )
            if version is not None:
                stmt = stmt.where(ChapterContent.version == version)
            rows = (await session.execute(stmt)).scalars().all()
            latest: dict[int, ChapterContent] = {}
            for content in rows:
                if content.chapter_id not in latest:
                    latest[content.chapter_id] = content
            return {
                "chapters": [
                    _format(latest.get(cid), cid)
                    for cid in ids
                ]
            }

    @tool
    async def write_chapter_content(
        chapter_id: Annotated[int, "章节ID"],
        content: Annotated[str, "要写入的正文内容"],
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """写入章节正文：一律新增一个 ChapterContent 版本（version=最新+1），不覆盖旧版本；章节 locked=True 时拒绝。"""
        logger.debug(f"[tool] write_chapter_content  chapter_id={chapter_id}  book_id={book_id}")
        async with session_factory() as session:
            ch = (
                await session.execute(
                    select(Chapter)
                    .join(Volume, Volume.id == Chapter.volume_id)
                    .where(Chapter.id == chapter_id, Volume.book_id == book_id)
                )
            ).scalar_one_or_none()
            if not ch:
                return {"error": "章节不存在或不属于当前书籍", "chapter_id": chapter_id}
            if ch.locked:
                return {"error": "章节已锁定，无法写入", "chapter_id": chapter_id}
            new_content = await _append_chapter_content_version(
                session, chapter_id, content
            )
            return {"chapter_id": chapter_id, "version": new_content.version, "word_count": len(content)}

    @tool
    async def write_workflow_candidate(
        chapter_id: Annotated[int, "目标章节 ID"],
        node_id: Annotated[str, "候选节点 ID，从工作流执行结果的 content_nodes 中选取（如 writer/polish）"],
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
        workflow_result: Annotated[dict | None, InjectedState("workflow_result")] = None,
        workflow_node_outputs: Annotated[dict | None, InjectedState("workflow_node_outputs")] = None,
    ) -> dict:
        """把工作流候选正文节点（content_nodes）的完整输出写入章节（落库）。

        工作流执行完成后，Agent 只需把用户选定的节点 ID 传给本工具，
        工具会直接从工作流执行结果中取出该节点的完整正文写入章节（新增版本，不覆盖），
        无需在对话上下文中传输整篇正文，避免 token 损耗。

        Args:
            chapter_id: 目标章节 ID。
            node_id: 用户选定节点的 node_id（从候选列表中的 node_id 字段选择）。
            workflow_result: 工作流执行结果（InjectedState 自动注入），含 content_nodes。
            workflow_node_outputs: 工作流各节点完整输出（跨回合持久化），fallback 数据源。
        """
        logger.debug(f"[tool] write_workflow_candidate  chapter_id={chapter_id}  node_id={node_id}  book_id={book_id}")
        nodes = (workflow_result or {}).get("content_nodes") or []
        node = next((n for n in nodes if n.get("node_id") == node_id), None)
        content = (node or {}).get("output", "") if node else ""
        node_label = (node or {}).get("node_label") or node_id
        # workflow_result 可能在新回合被重置，fallback 到跨回合持久化的 workflow_node_outputs
        if not content:
            persisted = (workflow_node_outputs or {}).get(node_id) or {}
            content = persisted.get("output", "") or ""
            node_label = persisted.get("label") or node_label
        if not node and not content:
            return {
                "error": f"候选节点 {node_id} 不存在，可用的候选节点：{', '.join(n.get('node_id', '') for n in nodes) or '无'}",
                "chapter_id": chapter_id,
            }
        if not content or not content.strip():
            return {"error": f"候选节点 {node_id} 输出为空，无法写入", "chapter_id": chapter_id}
        async with session_factory() as session:
            ch = (
                await session.execute(
                    select(Chapter)
                    .join(Volume, Volume.id == Chapter.volume_id)
                    .where(Chapter.id == chapter_id, Volume.book_id == book_id)
                )
            ).scalar_one_or_none()
            if not ch:
                return {"error": "章节不存在或不属于当前书籍", "chapter_id": chapter_id}
            if ch.locked:
                return {"error": "章节已锁定，无法写入", "chapter_id": chapter_id}
            new_content = await _append_chapter_content_version(
                session, chapter_id, content
            )
            return {
                "chapter_id": chapter_id,
                "node_id": node_id,
                "version": new_content.version,
                "word_count": len(content),
            }

    @tool
    async def edit_chapter_content(
        chapter_id: Annotated[int, "章节ID"],
        old_text: Annotated[str, "要被替换的原文片段，必须精确匹配当前最新正文中的内容（建议先 read_chapter_content 再编辑）"],
        new_text: Annotated[str, "替换后的新文本"],
        all_occurrences: Annotated[bool, "是否替换全部命中：True=替换所有命中；False=仅替换第一处"] = False,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """精确修改章节正文：在最新版本正文中把 old_text 替换为 new_text，仍新增一个版本（不覆盖旧版本）；章节 locked=True 时拒绝。"""
        logger.debug(f"[tool] edit_chapter_content  chapter_id={chapter_id}  book_id={book_id}")
        if not old_text:
            return {"error": "old_text 不能为空"}
        async with session_factory() as session:
            ch = (
                await session.execute(
                    select(Chapter)
                    .join(Volume, Volume.id == Chapter.volume_id)
                    .where(Chapter.id == chapter_id, Volume.book_id == book_id)
                )
            ).scalar_one_or_none()
            if not ch:
                return {"error": "章节不存在或不属于当前书籍", "chapter_id": chapter_id}
            if ch.locked:
                return {"error": "章节已锁定，无法修改", "chapter_id": chapter_id}
            max_ver = (await session.execute(select(func.max(ChapterContent.version)).where(ChapterContent.chapter_id == chapter_id))).scalar() or 0
            content_row = (await session.execute(
                select(ChapterContent).where(ChapterContent.chapter_id == chapter_id, ChapterContent.version == max_ver)
            )).scalar_one_or_none()
            current = content_row.content or "" if content_row else ""
            if old_text not in current:
                return {"error": "未找到匹配的 old_text，请先用 read_chapter_content 读取最新正文后重试", "matched": 0}
            count = current.count(old_text)
            if all_occurrences:
                replaced = current.replace(old_text, new_text)
            else:
                replaced = current.replace(old_text, new_text, 1)
            new_content = await _append_chapter_content_version(
                session, chapter_id, replaced
            )
            return {
                "chapter_id": chapter_id, "version": new_content.version,
                "matched": count, "replaced_all": bool(all_occurrences),
                "word_count": len(replaced), "preview": replaced[:200],
            }

    @tool
    async def apply_chapter_diff(
        chapter_id: Annotated[int, "章节ID"],
        unified_diff: Annotated[str, "标准 unified diff 文本（含 @@ hunk 头），对最新正文做局部修改"],
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """用 unified diff 局部修改章节正文：解析 @@ hunk 并应用到最新版本，仍新增一个版本（不覆盖旧版本）；章节 locked=True 时拒绝。"""
        logger.debug(f"[tool] apply_chapter_diff  chapter_id={chapter_id}  book_id={book_id}")
        if not unified_diff or not unified_diff.strip():
            return {"error": "unified_diff 不能为空"}
        async with session_factory() as session:
            ch = (
                await session.execute(
                    select(Chapter)
                    .join(Volume, Volume.id == Chapter.volume_id)
                    .where(Chapter.id == chapter_id, Volume.book_id == book_id)
                )
            ).scalar_one_or_none()
            if not ch:
                return {"error": "章节不存在或不属于当前书籍", "chapter_id": chapter_id}
            if ch.locked:
                return {"error": "章节已锁定，无法修改", "chapter_id": chapter_id}
            max_ver = (await session.execute(select(func.max(ChapterContent.version)).where(ChapterContent.chapter_id == chapter_id))).scalar() or 0
            content_row = (await session.execute(
                select(ChapterContent).where(ChapterContent.chapter_id == chapter_id, ChapterContent.version == max_ver)
            )).scalar_one_or_none()
            current = content_row.content or "" if content_row else ""
            try:
                new_text = _apply_unified_diff(current, unified_diff)
            except ValueError as exc:
                return {"error": f"diff 应用失败: {exc}", "version": max_ver}
            if new_text == current:
                return {"error": "diff 未产生任何改动，请检查 hunk 是否匹配当前正文", "version": max_ver}
            new_content = await _append_chapter_content_version(
                session, chapter_id, new_text
            )
            return {
                "chapter_id": chapter_id, "version": new_content.version,
                "word_count": len(new_text), "preview": new_text[:200],
            }

    return [
        read_chapter_content,
        write_chapter_content,
        write_workflow_candidate,
        edit_chapter_content,
        apply_chapter_diff,
    ]
