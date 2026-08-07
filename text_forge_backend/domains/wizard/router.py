"""创作初始化向导 — 路由器。

提供 AI 辅助生成各步骤候选卡片的端点。
"""

import json
import re
from typing import Annotated

from config.logging import get_logger
from core.auth import get_current
from core.model_factory import ModelFactory
from fastapi import APIRouter, Depends, HTTPException
from langchain_core.messages import HumanMessage, SystemMessage
from models.book import Book, Chapter, CreativeSetting, Volume
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from shared.database import db_manager
from shared.utils import truncate_text

from .prompts import STEP_PROMPTS

logger = get_logger(__name__)

router = APIRouter(prefix="/wizard", tags=["Wizard"])

STEP_NAMES: dict[int, str] = {
    0: "世界观", 1: "地点", 2: "角色", 3: "情节线",
    4: "大纲", 5: "事件", 6: "伏笔",
}


class WizardGenerateRequest(BaseModel):
    """wizard 生成请求。"""
    model_config = ConfigDict(populate_by_name=True)

    book_id: int = Field(alias="bookId")
    step: int = Field(ge=0, le=6)
    previous_cards: list[dict] | None = Field(default=[], alias="previousCards")
    exclude_titles: list[str] | None = Field(default=[], alias="excludeTitles")
    model_config_data: dict | None = Field(default=None, alias="modelConfig")
    extra_instruction: str | None = Field(default=None, alias="extraInstruction")


class WizardCard(BaseModel):
    """单张候选卡片。"""
    title: str
    fields: list[dict]  # [{key, value}, ...]


class WizardGenerateResponse(BaseModel):
    """wizard 生成成功响应。"""
    step: int
    cards: list[WizardCard]


def _to_candidate_fields(card: dict) -> list[dict]:
    """将 LLM 返回的 card dict 转为统一的 fields 格式。

    过滤掉 title 字段，其余 key/value 对转为 fields 数组。
    对于 dict/list 类型的值，序列化为 JSON 字符串。
    """
    fields = []
    for k, v in card.items():
        if k == "title":
            continue
        if isinstance(v, (dict, list)):
            fields.append({"key": _FIELD_LABEL_MAP.get(k, k), "value": json.dumps(v, ensure_ascii=False)})
        else:
            fields.append({"key": _FIELD_LABEL_MAP.get(k, k), "value": str(v) if v else ""})
    return fields


_FIELD_LABEL_MAP: dict[str, str] = {
    "worldview": "世界观",
    "core_conflict": "核心冲突",
    "tone": "文风基调",
    "taboos": "写作禁忌",
    "custom_fields": "自定义字段",
    "aliases": "别名",
    "status": "角色状态",
    "type": "类型",
    "description": "描述",
    "role_type": "角色类型",
    "outline": "大纲",
    "time": "时间",
    "location": "地点",
    "content": "内容",
    "reveal_timing": "揭示时机",
}


def _extract_json(text: str) -> dict | None:
    """从 LLM 回复中提取 JSON 对象。"""
    # 尝试直接解析
    text = text.strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass

    # 尝试 ```json ... ``` 代码块
    m = re.search(r"```(?:json)?\s*([\s\S]*?)```", text)
    if m:
        try:
            return json.loads(m.group(1).strip())
        except json.JSONDecodeError:
            pass

    # 尝试最外层 { ... }
    m = re.search(r"\{[\s\S]*\}", text)
    if m:
        try:
            return json.loads(m.group(0))
        except json.JSONDecodeError:
            pass

    return None


@router.post("/generate", response_model=WizardGenerateResponse)
async def generate_wizard_cards(
    user_id: Annotated[int, Depends(get_current)],
    body: WizardGenerateRequest,
    session: Annotated[AsyncSession, Depends(db_manager.get_db)],
):
    """为指定步骤生成 AI 候选卡片。

    Args:
        body: 包含 book_id、step（0-6）和可选的 model_config_data。
    """
    step = body.step
    if step not in STEP_PROMPTS:
        raise HTTPException(status_code=400, detail=f"无效步骤: {step}")

    system_prompt = STEP_PROMPTS[step]
    step_name = STEP_NAMES.get(step, f"step{step}")

    # ── 组装上下文 ──
    book_stmt = select(Book).where(Book.id == body.book_id, Book.user_id == user_id)
    book_res = await session.execute(book_stmt)
    book = book_res.scalar_one_or_none()
    if not book:
        raise HTTPException(status_code=404, detail="书籍不存在或无权访问")

    context_parts = []
    context_parts.append(f"书名：《{book.title}》")
    if book.genre:
        context_parts.append(f"类型：{book.genre}")
    if book.description:
        context_parts.append(f"简介：{book.description}")

    # 世界观/创意设定
    creative_stmt = select(CreativeSetting).where(CreativeSetting.book_id == body.book_id)
    creative_res = await session.execute(creative_stmt)
    creative = creative_res.scalar_one_or_none()
    if creative:
        if creative.worldview:
            context_parts.append(f"\n【世界观设定】\n{creative.worldview[:800]}")
        if creative.tone:
            context_parts.append(f"文风基调：{creative.tone[:200]}")
        if creative.writing_taboos:
            context_parts.append(f"写作禁忌（严禁出现）：{creative.writing_taboos[:300]}")
        if creative.custom_dimensions:
            dims = json.dumps(creative.custom_dimensions, ensure_ascii=False)
            context_parts.append(f"自定义设定维度：{dims[:400]}")

    # 已有地点
    from models.book import Location
    loc_stmt = select(Location).where(Location.book_id == body.book_id).limit(20)
    loc_res = await session.execute(loc_stmt)
    locs = loc_res.scalars().all()
    if locs:
        locs_text = "\n".join([
            f"- [{loc.id}] {loc.name}（{loc.type}）：{(loc.description or '')[:100]}"
            for loc in locs
        ])
        context_parts.append(f"\n【已有地点】\n{locs_text}")

    # 已有角色
    from models.book import Character
    char_stmt = select(Character).where(Character.book_id == body.book_id).limit(15)
    char_res = await session.execute(char_stmt)
    chars = char_res.scalars().all()
    if chars:
        chars_text = "\n".join([
            f"- [{ch.id}] {ch.name}（{ch.role_type or '角色'}）：{(ch.description or '')[:200]}"
            for ch in chars
        ])
        context_parts.append(f"\n【已有角色】\n{chars_text}")

    # 已有大纲（卷+章）
    if step >= 3:
        vol_stmt = select(Volume).where(Volume.book_id == body.book_id).order_by(Volume.sort_order)
        vol_res = await session.execute(vol_stmt)
        volumes = vol_res.scalars().all()
        if volumes:
            vol_ids = [v.id for v in volumes]
            ch_stmt = select(Chapter).where(Chapter.volume_id.in_(vol_ids)).order_by(Chapter.sort_order)
            ch_res = await session.execute(ch_stmt)
            chapters = ch_res.scalars().all()
            outline_text_parts = []
            for v in volumes:
                outline_text_parts.append(f"\n{v.title}")
                v_chapters = [c for c in chapters if c.volume_id == v.id]
                for ch in v_chapters:
                    outline_text_parts.append(f"  {ch.title}{' - ' + ch.summary if ch.summary else ''}")
            context_parts.append(f"\n【已有大纲】\n{chr(10).join(outline_text_parts)}")

    # 前序步骤中用户锁定/确认的候选卡片
    prev_cards = body.previous_cards or []
    if prev_cards:
        prev_text_parts: list[str] = []
        for pc in prev_cards:
            step_idx = pc.get("step", 0)
            title = pc.get("title", "")
            fields = pc.get("fields", [])
            field_str = "; ".join([f"{f.get('key','')}: {str(f.get('value',''))[:80]}" for f in fields[:3]])
            prev_text_parts.append(f"[步骤{step_idx}] {title}: {field_str}")
        context_parts.append(f"\n【用户在之前步骤中选定的方案】\n{chr(10).join(prev_text_parts)}")
        logger.info(f"[wizard] step={step} injected previous_cards context: {len(prev_text_parts)} entries")

    context = "\n".join(context_parts)

    # 已锁定标题 → 要求 LLM 勿重复
    exclude_notice = ""
    excl = body.exclude_titles or []
    if excl:
        exclude_notice = f"\n\n【重要】以下方案已被用户锁定，请勿生成重复内容：{'、'.join(excl[:10])}"

    # 额外指令（如大纲步骤的卷数/每卷章数约束）
    extra_instruction = body.extra_instruction or ""
    if extra_instruction:
        extra_instruction = f"\n\n【用户额外要求】\n{extra_instruction}\n请务必满足上述数量与结构约束。"

    # ── 构建消息 ──
    user_prompt = (
        f"你正在为小说创作向导生成「{step_name}」步骤的候选方案。\n\n"
        f"以下是当前已有的创作设定：\n\n{context}{exclude_notice}{extra_instruction}\n\n"
        f"请根据系统提示词的要求，生成 3~6 个候选方案。直接输出 JSON，不要任何额外文字。"
    )

    messages = [
        SystemMessage(content=system_prompt),
        HumanMessage(content=user_prompt),
    ]

    # ── 调用 LLM ──
    model_config = body.model_config_data or {}
    logger.info(f"[wizard] step={step} book_id={body.book_id} prev_cards={len(prev_cards)} context_chars={len(context)} user_prompt_chars={len(user_prompt)}")
    try:
        factory = ModelFactory(model_config)
        llm = factory.main
    except Exception as e:
        logger.warning(f"wizard 模型初始化失败，使用默认配置: {e}")
        factory = ModelFactory({})
        llm = factory.main

    try:
        raw = await llm.ainvoke(messages)
        raw_text = raw.content if hasattr(raw, "content") else str(raw)
        logger.debug(f"[wizard] step={step} raw_len={len(raw_text)}")
    except Exception as e:
        logger.exception(f"[wizard] LLM 调用失败 step={step}")
        raise HTTPException(status_code=500, detail=f"AI 生成失败: {str(e)[:100]}")

    # ── 解析 JSON ──
    parsed = _extract_json(raw_text)
    if not parsed:
        logger.warning(f"[wizard] JSON 解析失败 step={step}, raw={raw_text[:200]}")
        raise HTTPException(status_code=500, detail="AI 返回格式异常，请重试")

    # 兼容三种 LLM 输出格式：
    #   A. {"cards": [...]}           → 取 cards 数组
    #   B. [{...}, {...}]             → 直接作为 cards 数组
    #   C. {"title": "...", ...}      → 单对象包装为数组（step 0 表单填充恰好一个）
    if isinstance(parsed, list):
        raw_cards = parsed
    elif isinstance(parsed, dict):
        raw_cards = parsed.get("cards", [])
        if not raw_cards and any(k in parsed for k in ("title", "worldview", "tone")):
            raw_cards = [parsed]  # step 0 表单：单对象包装
    else:
        raise HTTPException(status_code=500, detail="AI 返回格式异常，请重试")

    if len(raw_cards) == 0:
        logger.warning(f"[wizard] raw_cards 为空 step={step}, parsed_type={type(parsed).__name__}, raw_preview={raw_text[:300]}")
        raise HTTPException(status_code=500, detail=f"AI 未生成有效方案，请重试。返回内容: {raw_text[:100]}")

    # ── 转换为统一格式 ──
    cards: list[WizardCard] = []
    for i, rc in enumerate(raw_cards):
        if not isinstance(rc, dict):
            continue
        title = rc.get("title", f"方案{i + 1}")
        fields = _to_candidate_fields(rc)
        cards.append(WizardCard(title=title, fields=fields))

    return WizardGenerateResponse(step=step, cards=cards)
