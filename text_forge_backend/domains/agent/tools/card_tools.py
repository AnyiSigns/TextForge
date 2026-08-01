
from config.logging import get_logger
from core.model_factory import ModelFactory
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool

logger = get_logger(__name__)

CARD_TYPE_DESCRIPTIONS = {
    "world_setup": "世界观设定 - 项目初始化时提议",
    "plot_direction": "故事走向 - 每章/每卷开始前提议",
    "character_intro": "角色 - Agent 感知需要新角色时提议",
    "location_card": "地点 - Agent 感知需要新场景时提议",
    "foreshadow_card": "伏笔 - 章节完成后提议",
    "char_dialogue": "角色对话模拟 - 用户触发或 Agent 提议",
    "custom": "用户自定义 - 项目设置中定义",
}


def build_propose_cards_tool(session_factory, model_config: dict | None = None):
    @tool
    async def propose_cards(
        card_types: list[str],
        book_id: int,
        user_id: int,
        reason: str = "",
    ) -> dict:
        if not model_config:
            return {"proposed": False, "cards": [], "message": "模型未配置"}

        llm = ModelFactory(model_config)
        valid_types = [t for t in card_types if t in CARD_TYPE_DESCRIPTIONS]
        if not valid_types:
            return {"proposed": False, "cards": [], "message": "无效的卡片类型"}

        async with session_factory() as session:
            try:
                from models.book import Book, Character
                from sqlalchemy import select as sa_select
                book_stmt = sa_select(Book).where(Book.id == book_id)
                result = await session.execute(book_stmt)
                book = result.scalar_one_or_none()
                book_context = ""
                if book:
                    book_context = f"书名：{book.title}\n体裁：{book.genre or ''}\n简介：{book.description or ''}"
                    char_stmt = sa_select(Character).where(Character.book_id == book_id).limit(10)
                    char_result = await session.execute(char_stmt)
                    chars = char_result.scalars().all()
                    if chars:
                        book_context += "\n角色：" + ", ".join([c.name for c in chars])
            except Exception as exc:
                logger.warning(f"propose_cards 加载上下文失败: {exc}")
                book_context = f"book_id={book_id}"

        type_names = [CARD_TYPE_DESCRIPTIONS.get(t, t) for t in valid_types]
        prompt = (
            f"为以下书籍生成创意卡片提案：\n{book_context}\n\n"
            f"需要生成的卡片类型：{', '.join(type_names)}\n"
            f"提出原因：{reason or 'Agent 认为需要补充这些设定'}\n\n"
            f"请以 JSON 数组格式输出卡片提案，每张卡片包含：type, title, summary (100字左右)。"
            f"只输出 JSON，不要其他内容。"
        )
        try:
            result = await llm.main.ainvoke([SystemMessage(content="你是创意卡片生成助手。"), HumanMessage(content=prompt)])
            content = result.content if hasattr(result, "content") else str(result)
        except Exception:
            logger.exception("propose_cards LLM 调用失败")
            return {"proposed": False, "cards": [], "message": "卡片生成失败，请稍后重试"}

        cards = []
        try:
            import json
            if "```json" in content:
                json_str = content.split("```json")[1].split("```")[0].strip()
            elif "```" in content:
                json_str = content.split("```")[1].split("```")[0].strip()
            else:
                json_str = content.strip()
            parsed = json.loads(json_str)
            if isinstance(parsed, list):
                cards = [
                    {"card_type": c.get("type", "custom"), "title": c.get("title", ""), "summary": c.get("summary", "")}
                    for c in parsed if isinstance(c, dict)
                ]
        except Exception:
            logger.warning(f"propose_cards JSON 解析失败，原始输出: {content[:300]}")
            cards = [{"card_type": ct, "title": f"{CARD_TYPE_DESCRIPTIONS.get(ct, ct)} 提案", "summary": content[:200]} for ct in valid_types]

        return {"proposed": True, "cards": cards, "reason": reason, "message": f"已生成 {len(cards)} 张卡片提案"}

    return propose_cards
