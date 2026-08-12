"""创作初始化向导 — 路由器。

全部 7 步统一走 Markdown 单份方案流式生成（SSE）：Step 0 世界观、
Step 1 地点、Step 2 角色、Step 3 情节线、Step 4 大纲（按卷分批）、
Step 5 事件、Step 6 伏笔。前端解析 Markdown 后落库。

通用生成器语义：
- 每步上下文按「该类型生成所需的引用实体 + 已有同类实体」查库组装，
  不依赖步骤顺序（跳过某步后，后续步骤缺前置数据会以 meta.warnings 提示）。
- mode=init/append/auto：初始化（新书）与追加（已有设定）共用同一路径；
  追加时上下文携带已有设定，提示词要求衔接去重，绝不复盖已有数据。
- 无论何种模式，生成的都是设定素材/结构规划，严禁输出正文成稿与最终结局。
"""

import json
import re
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException
from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from config.logging import get_logger
from core.auth import get_current
from core.model_factory import ModelFactory
from models.book import Book, Chapter, CreativeSetting, Volume
from shared.utils import redact_sensitive
from shared.database import db_manager

from .prompts import STEP_PROMPTS

logger = get_logger(__name__)

router = APIRouter(prefix="/wizard", tags=["Wizard"])

# 7 步步名与前端 initializerStore.ts STEP_LABELS 契约一致（修改需同步两端）
STEP_NAMES: dict[int, str] = {
    0: "世界观",
    1: "地点",
    2: "角色",
    3: "情节线",
    4: "大纲",
    5: "事件",
    6: "伏笔",
}


def _fmt(items, formatter):
    """把实体列表格式化为带 [id] 标注的上下文行（全量注入，不截断）。

    此前按行数截断（40 行），实体数超过上限时 LLM 看不到全部清单，
    会引用清单外名称导致前端引用校验失败、整步落库被中止。
    """
    return "\n".join(formatter(item) for item in items)


async def _build_wizard_context(
    session: AsyncSession,
    book_id: int,
    step: int,
    creative: "CreativeSetting | None" = None,
) -> tuple[str, list[str], bool, int]:
    """按步骤类型组装生成上下文（查库生成，不依赖步骤顺序）。

    每步需要的上下文 = 生成该类型所需的「引用实体」+「已有同类实体」：
    - Step 0 世界观：已有创意设定（追加/重新生成时避免覆盖已有内容）
    - Step 1 地点：已有地点（防重名）
    - Step 2 角色：已有地点（首次出场/所在地）+ 已有角色（防重、关系链目标）
    - Step 3 情节线：已有情节线（防重、子线挂主线）+ 已有角色（交织点，弱依赖）
    - Step 4 大纲：情节线/地点/角色（场景节点三字段必须取自清单）+ 已有卷章（前序卷衔接）
    - Step 5 事件：卷章（章节绑定）+ 地点/角色/情节线 + 已有事件（防重、时间线衔接）
    - Step 6 伏笔：事件（埋下事件必须取自清单）+ 角色 + 已有伏笔（防重、伏笔网络）

    Args:
        session: 数据库会话。
        book_id: 书籍 ID。
        step: 向导步骤（0-6）。
        creative: 已有创意设定（调用方查库后传入，用于 mode=auto 的 has_existing 推断）。

    Returns:
        (上下文文本, 前置校验 warnings 列表, 是否已有设定素材, 已有卷数)。
    """
    from models.book import (
        Character,
        Foreshadowing,
        Location,
        PlotThread,
        SceneEvent,
    )

    context_parts: list[str] = []
    warnings: list[str] = []
    # 已有创意设定由调用方查库后传入（避免 Step 0 双查询双注入）；
    # has_existing 参与 mode=auto 的「是否已有设定」推断。
    has_existing = creative is not None

    # 已有地点（Step 1+：防重名；Step 2/4/5：引用清单；全量注入不截断）
    if step >= 1:
        loc_stmt = select(Location).where(Location.book_id == book_id)
        loc_res = await session.execute(loc_stmt)
        locs = loc_res.scalars().all()
        if locs:
            locs_text = _fmt(
                locs,
                lambda l: f"- [{l.id}] {l.name}（{l.type}）：{(l.description or '')[:100]}",
            )
            context_parts.append(f"\n【已有地点】\n{locs_text}")
            has_existing = True

    # 已有角色（Step 2+：防重名、关系链目标、场景引用；全量注入不截断）
    if step >= 2:
        char_stmt = select(Character).where(Character.book_id == book_id)
        char_res = await session.execute(char_stmt)
        chars = char_res.scalars().all()
        if chars:
            chars_text = _fmt(
                chars,
                lambda c: f"- [{c.id}] {c.name}（{c.role_type or '角色'}）：{(c.description or '')[:150]}",
            )
            context_parts.append(f"\n【已有角色】\n{chars_text}")
            has_existing = True

    # 已有情节线（Step 3+：防重、子线挂主线；Step 4/5：场景/事件引用）
    if step >= 3:
        pt_stmt = (
            select(PlotThread).where(PlotThread.book_id == book_id).order_by(PlotThread.id)
        )
        pt_res = await session.execute(pt_stmt)
        pts = pt_res.scalars().all()
        if pts:
            pts_text = _fmt(
                pts,
                lambda p: f"- [{p.id}] {p.name}（{p.type or '支线'}）：{(p.description or '')[:100]}",
            )
            context_parts.append(f"\n【已有情节线】\n{pts_text}")
            has_existing = True

    # 已有大纲（卷+章）：Step 4 前序卷衔接；Step 5 章节绑定
    existing_volume_count = 0
    if step >= 4:
        vol_stmt = (
            select(Volume).where(Volume.book_id == book_id).order_by(Volume.sort_order)
        )
        vol_res = await session.execute(vol_stmt)
        volumes = vol_res.scalars().all()
        existing_volume_count = len(volumes)
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
            has_existing = True
        elif step == 5:
            warnings.append("尚未生成大纲（卷/章），生成的事件将无法归属章节")

    # 已有场景事件（Step 5/6：防重、时间线衔接；Step 6 埋下事件候选；全量注入不截断）
    if step >= 5:
        ev_stmt = (
            select(SceneEvent)
            .where(SceneEvent.book_id == book_id)
            .order_by(SceneEvent.story_ts, SceneEvent.id)
        )
        ev_res = await session.execute(ev_stmt)
        evs = ev_res.scalars().all()
        if evs:
            ev_text = _fmt(
                evs,
                lambda e: f"- [{e.id}] {e.title}（{e.story_label or '未标注时间'}）：{(e.content or '')[:60]}",
            )
            context_parts.append(f"\n【已有场景事件】\n{ev_text}")
            has_existing = True
        elif step == 6:
            warnings.append("尚未生成场景事件，伏笔的「埋下事件」将无法关联")

    # 已有伏笔（Step 6：防重、伏笔网络相互引用）
    if step >= 6:
        fs_stmt = (
            select(Foreshadowing).where(Foreshadowing.book_id == book_id).order_by(Foreshadowing.id)
        )
        fs_res = await session.execute(fs_stmt)
        fs_items = fs_res.scalars().all()
        if fs_items:
            fs_text = _fmt(
                fs_items,
                lambda f: f"- [{f.id}] {f.type or '未分类'}：{(f.description or '')[:80]}",
            )
            context_parts.append(f"\n【已有伏笔】\n{fs_text}")
            has_existing = True

    return "\n".join(context_parts), warnings, has_existing, existing_volume_count


class WizardStreamRequest(BaseModel):
    """wizard 流式生成请求（Step 0-6，Markdown 单份方案，SSE）。

    mode 缺省 auto：按书籍是否已有设定自动推断（有设定 → append）。
    """

    model_config = ConfigDict(populate_by_name=True)

    book_id: int = Field(alias="bookId")
    step: int = Field(ge=0, le=6)
    mode: Literal["init", "append", "auto"] = "auto"
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
    structured_context, warnings, has_existing, existing_volume_count = await _build_wizard_context(
        session, body.book_id, step, creative=creative
    )
    if structured_context:
        context_parts.append(structured_context)

    # 模式推断：显式指定优先；缺省 auto 按「书籍是否已有设定素材」判断
    mode = body.mode
    if mode == "auto":
        mode = "append" if has_existing else "init"
    mode_hint = (
        "本次为【追加模式】：书籍已有设定，请与【已有*】清单中的内容衔接，"
        "只补充新的设定素材，严禁重复或覆盖已有内容。"
        if mode == "append"
        else "本次为【初始化模式】：新书首次生成设定，从零创建完整方案。"
    )

    extra = body.extra_instruction or ""
    setting_notice = (
        "\n\n【重要】本生成器用于初始化新书或为已有书籍追加设定素材，"
        "生成的是创建阶段的设定素材与结构规划，而非直接创作小说正文。"
        "严禁输出成稿正文、大段叙述或最终结局。"
    )
    base_user = (
        f"你正在为小说创作向导生成「{step_name}」步骤的方案（Markdown，单份完整方案）。\n\n"
        f"以下是当前已有的创作设定：\n\n{chr(10).join(context_parts)}\n\n"
        f"{mode_hint}"
        f"{setting_notice}"
        f"\n\n请根据系统提示词要求直接输出 Markdown 文本，不要输出任何额外说明。"
    )
    if extra:
        base_user += f"\n\n【用户额外要求】\n{extra}\n请务必满足上述数量与结构约束。"

    async def event_gen():
        full_text = ""
        try:
            # LLM 构建失败也统一走 SSE error 事件（此前在主函数内构建，
            # 二次抛异常会直接 500 而非发送 error）
            llm = await _make_llm(body.model_config_data or {})
            if step == 4:
                volume_count, chapters = _parse_volume_spec(extra)
                if len(chapters) < volume_count:
                    tail = chapters[-1] if chapters else 5
                    chapters = chapters + [tail] * (volume_count - len(chapters))
                # batch_volumes：本次新增卷数（前端进度条 total 用）；
                # 与提示词里的 total_volumes（全书总卷数 = base_vol + batch）语义不同
                yield _sse(
                    {"type": "meta", "step": step, "batch_volumes": volume_count, "mode": mode, "warnings": warnings}
                )
                previous_outline = ""
                # 追加模式：库中已有卷时卷号顺延（避免 LLM 从「第 1 卷」重生成覆盖语义）
                base_vol = existing_volume_count if mode == "append" else 0
                total_volumes = base_vol + volume_count
                for i in range(volume_count):
                    vol_prompt = (
                        f"请生成大纲第 {base_vol + i + 1} 卷（全书共 {total_volumes} 卷），该卷共 {chapters[i]} 章。\n\n"
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
                yield _sse(
                    {"type": "meta", "step": step, "batch_volumes": 1, "mode": mode, "warnings": warnings}
                )
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
            yield _sse({"type": "error", "message": f"AI 生成失败: {redact_sensitive(str(e)[:200])}"})

    from fastapi.responses import StreamingResponse

    return StreamingResponse(
        event_gen(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
