"""创作初始化向导 — 路由器。

全部 7 步统一走 Markdown 单份方案流式生成（SSE）：Step 0 世界观、
Step 1 地点、Step 2 角色、Step 3 情节线、Step 4 大纲（按卷分批）、
Step 5 事件、Step 6 伏笔。前端解析 Markdown 后落库。
"""

import json
import re
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config.logging import get_logger
from core.auth import get_current
from core.model_factory import ModelFactory
from models.book import Book, Chapter, CreativeSetting, Volume
from shared.database import db_manager

from .prompts import STEP_PROMPTS

logger = get_logger(__name__)

router = APIRouter(prefix="/wizard", tags=["Wizard"])

STEP_NAMES: dict[int, str] = {
    0: "世界观",
    1: "地点",
    2: "角色",
    3: "情节线",
    4: "大纲",
    5: "事件",
    6: "伏笔",
}


async def _build_wizard_context(
    session: AsyncSession,
    book_id: int,
    step: int,
) -> str:
    """组装 wizard 生成步骤的上下文文本。

    Args:
        session: 数据库会话。
        book_id: 书籍 ID。
        step: 向导步骤（0-6）。

    Returns:
        组装好的上下文文本。
    """
    from models.book import Character, Location, PlotThread, SceneEvent

    context_parts = []

    # 已有情节线（Step 4+ 需要：场景节点要关联情节线）
    if step >= 4:
        pt_stmt = (
            select(PlotThread)
            .where(PlotThread.book_id == book_id)
            .order_by(PlotThread.id)
        )
        pt_res = await session.execute(pt_stmt)
        pts = pt_res.scalars().all()
        if pts:
            pts_text = "\n".join(
                [
                    f"- [{pt.id}] {pt.name}（{pt.type or '支线'}）：{(pt.description or '')[:100]}"
                    for pt in pts
                ]
            )
            context_parts.append(f"\n【已有情节线】\n{pts_text}")

    # 已有地点（Step 1+ 需要：避免生成重复地点）
    if step >= 1:
        loc_stmt = select(Location).where(Location.book_id == book_id).limit(20)
        loc_res = await session.execute(loc_stmt)
        locs = loc_res.scalars().all()
        if locs:
            locs_text = "\n".join(
                [
                    f"- [{loc.id}] {loc.name}（{loc.type}）：{(loc.description or '')[:100]}"
                    for loc in locs
                ]
            )
            context_parts.append(f"\n【已有地点】\n{locs_text}")

    # 已有角色（Step 2+ 需要：避免生成重复角色）
    if step >= 2:
        char_stmt = select(Character).where(Character.book_id == book_id).limit(30)
        char_res = await session.execute(char_stmt)
        chars = char_res.scalars().all()
        if chars:
            chars_text = "\n".join(
                [
                    f"- [{ch.id}] {ch.name}（{ch.role_type or '角色'}）：{(ch.description or '')[:200]}"
                    for ch in chars
                ]
            )
            context_parts.append(f"\n【已有角色】\n{chars_text}")

    # 已有大纲（卷+章）
    if step >= 3:
        vol_stmt = (
            select(Volume).where(Volume.book_id == book_id).order_by(Volume.sort_order)
        )
        vol_res = await session.execute(vol_stmt)
        volumes = vol_res.scalars().all()
        if volumes:
            vol_ids = [v.id for v in volumes]
            ch_stmt = (
                select(Chapter)
                .where(Chapter.volume_id.in_(vol_ids))
                .order_by(Chapter.sort_order)
            )
            ch_res = await session.execute(ch_stmt)
            chapters = ch_res.scalars().all()
            outline_text_parts = []
            for v in volumes:
                outline_text_parts.append(f"\n{v.title}")
                v_chapters = [c for c in chapters if c.volume_id == v.id]
                for ch in v_chapters:
                    outline_text_parts.append(
                        f"  {ch.title}{' - ' + ch.summary if ch.summary else ''}"
                    )
            context_parts.append(f"\n【已有大纲】\n{chr(10).join(outline_text_parts)}")

    # 已有场景事件（Step 5/6 需要：事件作为补充/埋下事件的候选）
    if step >= 5:
        ev_stmt = (
            select(SceneEvent)
            .where(SceneEvent.book_id == book_id)
            .order_by(SceneEvent.story_ts, SceneEvent.id)
            .limit(40)
        )
        ev_res = await session.execute(ev_stmt)
        evs = ev_res.scalars().all()
        if evs:
            ev_text = "\n".join(
                [
                    f"- [{ev.id}] {ev.title}（{ev.story_label or '未标注时间'}）：{(ev.content or '')[:60]}"
                    for ev in evs
                ]
            )
            context_parts.append(f"\n【已有场景事件】\n{ev_text}")

    return "\n".join(context_parts)


class WizardStreamRequest(BaseModel):
    """wizard 流式生成请求（Step 0-6，Markdown 单份方案，SSE）。"""

    model_config = ConfigDict(populate_by_name=True)

    book_id: int = Field(alias="bookId")
    step: int = Field(ge=0, le=6)
    model_config_data: dict | None = Field(default=None, alias="modelConfig")
    extra_instruction: str | None = Field(default=None, alias="extraInstruction")


def _sse(data: dict) -> str:
    """构造一条 SSE 消息。"""
    return f"data: {json.dumps(data, ensure_ascii=False)}\n\n"


def _parse_volume_spec(extra: str) -> tuple[int, list[int]]:
    """从额外指令中解析卷数与每卷章数。

    期望格式：「卷数=N 每卷章数=M,M,M」。

    Args:
        extra: 用户额外指令文本。

    Returns:
        (卷数, 每卷章数列表)。
    """
    vol_m = re.search(r"卷数\s*[:=＝]?\s*(\d+)", extra or "")
    volume_count = int(vol_m.group(1)) if vol_m else 1
    # 上限保护：防止恶意/错误数值触发大量顺序 LLM 调用与内存分配
    volume_count = max(1, min(volume_count, 20))
    ch_m = re.search(r"每卷章数\s*[:=＝]?\s*([\d,，\s]+)", extra or "")
    chapters: list[int] = []
    if ch_m:
        for x in re.split(r"[，,\s]+", ch_m.group(1).strip()):
            if x.isdigit():
                chapters.append(min(int(x), 50))
    return volume_count, chapters


async def _make_llm(model_config: dict):
    """构建 LLM 实例（配置失败时回退默认）。"""
    try:
        factory = ModelFactory(model_config)
        return factory.main
    except Exception as e:
        logger.warning(f"wizard 模型初始化失败，使用默认配置: {e}")
        return ModelFactory({}).main


async def _stream_llm_chunks(llm, messages):
    """逐 chunk 产出 LLM 流式输出文本。

    优先使用 astream 流式接口实现 token 级推送；模型不支持流式时
    回退 ainvoke 一次性生成。

    Args:
        llm: langchain BaseChatModel 实例。
        messages: 消息列表。

    Yields:
        文本片段。
    """
    try:
        async for chunk in llm.astream(messages):
            piece = chunk.content if hasattr(chunk, "content") else str(chunk)
            if piece:
                yield piece
    except Exception:
        logger.warning("[wizard] LLM 流式接口不可用，回退一次性生成", exc_info=True)
        raw = await llm.ainvoke(messages)
        text = raw.content if hasattr(raw, "content") else str(raw)
        if text:
            yield text


@router.post("/stream-generate")
async def stream_generate_wizard(
    user_id: Annotated[int, Depends(get_current)],
    body: WizardStreamRequest,
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    """为 Step 0-6 流式生成 Markdown 单份方案（SSE）。

    Step 4 大纲按卷分批生成：内部逐卷调用 LLM，每卷完成推送一条 volume_end。
    其余步骤单次生成，文本逐行推送。

    Args:
        body: 包含 book_id、step（0-6）和可选的 extra_instruction / model_config。
    """
    step = body.step
    if step not in STEP_PROMPTS:
        raise HTTPException(status_code=400, detail=f"无效步骤: {step}")

    book_stmt = select(Book).where(Book.id == body.book_id, Book.user_id == user_id)
    book_res = await session.execute(book_stmt)
    book = book_res.scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在或无权访问")

    system_prompt = STEP_PROMPTS[step]
    step_name = STEP_NAMES.get(step, f"step{step}")

    context_parts = [f"书名：《{book.title}》"]
    if book.genre:
        context_parts.append(f"类型：{book.genre}")
    if book.description:
        context_parts.append(f"简介：{book.description}")
    creative_stmt = select(CreativeSetting).where(
        CreativeSetting.book_id == body.book_id
    )
    creative_res = await session.execute(creative_stmt)
    creative = creative_res.scalar_one_or_none()
    if creative:
        if creative.worldview:
            context_parts.append(f"\n【世界观设定】\n{creative.worldview[:800]}")
        if creative.tone:
            context_parts.append(f"文风基调：{creative.tone[:200]}")
        if creative.writing_taboos:
            context_parts.append(
                f"写作禁忌（严禁出现）：{creative.writing_taboos[:300]}"
            )
        if creative.custom_dimensions:
            dims = json.dumps(creative.custom_dimensions, ensure_ascii=False)
            context_parts.append(f"自定义设定维度：{dims[:400]}")
    structured_context = await _build_wizard_context(session, body.book_id, step)
    if structured_context:
        context_parts.append(structured_context)

    extra = body.extra_instruction or ""
    init_notice = "\n\n【重要】本向导用于初始化一本新书，生成的是创建阶段的设定素材与结构规划，而非直接创作小说正文。严禁输出成稿正文、大段叙述或最终结局。"
    base_user = (
        f"你正在为小说创作向导生成「{step_name}」步骤的方案（Markdown，单份完整方案）。\n\n"
        f"以下是当前已有的创作设定：\n\n{chr(10).join(context_parts)}\n\n"
        f"请根据系统提示词要求直接输出 Markdown 文本，不要输出任何额外说明。"
        f"{init_notice}"
    )
    if extra:
        base_user += f"\n\n【用户额外要求】\n{extra}\n请务必满足上述数量与结构约束。"

    llm = await _make_llm(body.model_config_data or {})

    async def event_gen():
        full_text = ""
        try:
            if step == 4:
                volume_count, chapters = _parse_volume_spec(extra)
                if len(chapters) < volume_count:
                    tail = chapters[-1] if chapters else 5
                    chapters = chapters + [tail] * (volume_count - len(chapters))
                yield _sse(
                    {"type": "meta", "step": step, "total_volumes": volume_count}
                )
                previous_outline = ""
                for i in range(volume_count):
                    vol_prompt = (
                        f"请生成大纲第 {i + 1} 卷（共 {volume_count} 卷），该卷共 {chapters[i]} 章。\n\n"
                        f"【前序卷已生成的大纲】（供衔接参考，不要重复内容）\n{previous_outline or '（无，本卷为第一卷）'}\n\n"
                        f"{base_user}"
                    )
                    messages = [
                        SystemMessage(content=system_prompt),
                        HumanMessage(content=vol_prompt),
                    ]
                    vol_text = ""
                    async for piece in _stream_llm_chunks(llm, messages):
                        vol_text += piece
                        full_text += piece
                        yield _sse({"type": "delta", "text": piece})
                    previous_outline += vol_text + "\n"
                    yield _sse({"type": "volume_end", "index": i + 1})
            else:
                yield _sse({"type": "meta", "step": step, "total_volumes": 1})
                messages = [
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=base_user),
                ]
                async for piece in _stream_llm_chunks(llm, messages):
                    full_text += piece
                    yield _sse({"type": "delta", "text": piece})
            yield _sse({"type": "done", "step": step, "full_text": full_text})
        except Exception as e:
            logger.exception(f"[wizard] 流式生成失败 step={step}")
            yield _sse({"type": "error", "message": f"AI 生成失败: {str(e)[:200]}"})

    from fastapi.responses import StreamingResponse

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
