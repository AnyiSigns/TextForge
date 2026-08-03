import asyncio
import json
from typing import AsyncGenerator

from config.logging import get_logger
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI

from core.model_factory import ModelFactory

logger = get_logger(__name__)

CARD_SYSTEM_PROMPT = """你是资深的文学创作顾问。你的任务是提供专业、有深度、可直接采用的创意设定方案。

输出格式：
{"cards": [{"title": "方案名", "fields": [{"key": "字段名", "value": "内容"}]}]}

要求：
- 只输出严格 JSON，不含 markdown 代码块
- 所有 value 必须是纯文本字符串，严禁数组或对象
- 内容具体生动，有细节有层次，避免空泛套话"""


STEP_PROMPTS = {
    "creative_setting": """你是资深文学编辑。根据以下书籍信息，提出 1 个创意设定方案。

书名：{title}
体裁：{genre}
简介：{description}
总字数目标：{total_word_goal}

{variation}

输出一张卡片，fields 必须包含以下 5 个字段（全部 value 为纯文本字符串）：
1. {{"key":"方案名称","value":"4-8字方案名"}}
2. {{"key":"文风","value":"语调、行文风格、叙述视角的详细描述（150-200字）"}}
3. {{"key":"世界观","value":"设定体系、势力格局、核心法则（150-200字）"}}
4. {{"key":"写作禁忌","value":"应避免的套路及限制条件，分条叙述用换行分隔（3-5条）"}}
5. {{"key":"自定义维度","value":"适合该题材的 2-3 个自定义设定维度，格式：维度名：说明（每条换行）"}}

{extra_context}
{requirements_section}""",
    "locations": """根据以下书籍信息和世界观设定，生成 {batch_size} 张地点卡片：

书名：{title}
体裁：{genre}

{extra_context}

每张地点卡片包含字段：
- 名称(name)
- 类型(type：城市/建筑/自然/室内/场所/虚空)
- 描述(description：环境特征、氛围、在故事中的作用)
- 属性(attributes：1-2个特色属性，如"灵气稀薄""终年飞雪")

{requirements_section}""",
    "characters": """根据以下书籍信息和已有设定，生成 {batch_size} 张角色卡片：

书名：{title}
体裁：{genre}

{extra_context}

每张角色卡片包含字段：
- 名称(name)
- 描述(description：外貌、性格、背景)
- 角色类型(role_type：主角/配角/反派/路人/导师)
- 别名(aliases：数组，可为空)
- 自定义字段(custom_fields：根据题材提议的额外属性，如功法/武器/血统)

{requirements_section}""",
    "character_relations": """根据以下角色列表，生成角色间的关系链。

{characters_text}

为每对重要关系生成一条关系记录，格式：
[{{"source": "角色A名称", "target": "角色B名称", "relation": "关系描述"}}]

只输出 JSON 数组，不要其他内容。{requirements_section}""",
    "timeline_foreshadowing": """根据以下书籍信息和设定，生成 {batch_size} 张卡片（混合时间线事件和伏笔）：

书名：{title}
体裁：{genre}

{extra_context}

时间线事件卡片(标签：timeline)字段：
- 名称(name)
- 描述(description)
- 事件类型(event_type：冲突/转折/揭示/过渡/日常)

伏笔卡片(标签：foreshadowing)字段：
- 描述(description)
- 揭示方式(reveal_type：闪回/暗示/对话/书信/回忆)
- 备注(notes)

时间线和伏笔比例约 2:1。

{requirements_section}""",
    "plot_threads": """根据以下书籍信息和设定，生成 {batch_size} 张剧情线索卡片：

书名：{title}
体裁：{genre}

{extra_context}

每张剧情线索卡片字段：
- 名称(name)
- 描述(description：这条线的走向和核心冲突)
- 类型(type：主线/支线/暗线)
- 关联角色(related_characters：字符串数组，列出涉及的角色名)

{requirements_section}""",
    "outline": """根据以下书籍信息和设定，生成大纲结构：

书名：{title}
体裁：{genre}

{extra_context}

{outline_specific}

每张卡片字段根据层级不同：
- 卷级：标题(title) + 摘要(summary)
- 章级：标题(title) + 摘要(summary) + 出场角色(character_ids：字符串数组)
- 节点级：标题(title) + 内容(content：场景简述)

{requirements_section}""",
}


def _build_extra_context(context: dict) -> str:
    parts = []
    if "creative_setting" in context:
        cs = context["creative_setting"]
        parts.append(f"文风：{cs.get('tone', '未设定')}")
        parts.append(f"世界观：{cs.get('worldview', '未设定')}")
        parts.append(f"禁忌：{cs.get('writing_taboos', '未设定')}")
        custom = cs.get("custom_dimensions", {})
        if custom:
            dim_text = "；".join(f"{k}: {v}" for k, v in custom.items())
            parts.append(f"自定义维度：{dim_text}")
    if "locations" in context:
        locs = context["locations"]
        if locs:
            loc_names = [loc.get("name", "") for loc in locs]
            parts.append(f"已有地点：{', '.join(loc_names)}")
    if "characters" in context:
        chars = context["characters"]
        if chars:
            char_texts = [
                f"{c.get('name', '')}({c.get('role_type', '')})" for c in chars
            ]
            parts.append(f"已有角色：{'; '.join(char_texts)}")
    if "timeline" in context:
        tl = context.get("timeline", [])
        if tl:
            parts.append(f"已有时间线事件数：{len(tl)}")
    if "foreshadowing" in context:
        fg = context.get("foreshadowing", [])
        if fg:
            parts.append(f"已有伏笔数：{len(fg)}")
    if "plot_threads" in context:
        pt = context.get("plot_threads", [])
        if pt:
            pt_names = [t.get("name", "") for t in pt]
            parts.append(f"已有剧情线：{', '.join(pt_names)}")
    return "\n".join(parts)


def _format_outline_prompt(
    context: dict,
    volume_count: int,
    chapters_per_volume: int,
    nodes_per_chapter: int,
    mode: str,
) -> str:
    existing = ""
    if "volumes" in context:
        vols = context["volumes"]
        if vols:
            vol_texts = []
            for i, v in enumerate(vols):
                ch_texts = []
                for j, c in enumerate(v.get("chapters", [])):
                    node_text = (
                        f", {len(c.get('nodes', []))}个节点" if c.get("nodes") else ""
                    )
                    ch_texts.append(
                        f"  第{j+1}章：{c.get('title', '未命名')}{node_text}"
                    )
                vol_texts.append(
                    f"第{i+1}卷：{v.get('title', '未命名')}\n" + "\n".join(ch_texts)
                )
            existing = "已生成结构：\n" + "\n".join(vol_texts)

    if mode == "all":
        return f"""请生成完整的 {volume_count} 卷大纲，每卷 {chapters_per_volume} 章，每章 {nodes_per_chapter} 个节点（场景）。

层级结构：
- 卷(title + summary) → 章(title + summary + character_ids) → 章节点(title + content)

每层卡片标签分别为 volume / chapter / node。
按顺序输出所有卡片，卷→章→节点的层级关系用序号体现。

{existing}"""
    elif mode == "volume":
        return f"""请生成第 {context.get('_current_volume_index', 1)+1} 卷的大纲，含 {chapters_per_volume} 章，每章 {nodes_per_chapter} 个节点。

层级结构：
- 卷(title + summary) → 章(title + summary + character_ids) → 章节点(title + content)

每层卡片标签分别为 volume / chapter / node。

{existing}"""
    else:
        vol_idx = context.get("_current_volume_index", 0)
        ch_idx = context.get("_current_chapter_index", 0)
        return f"""请生成第 {vol_idx+1} 卷第 {ch_idx+1} 章的大纲，含 {nodes_per_chapter} 个节点（场景）。

层级结构：
- 章(title + summary + character_ids) → 章节点(title + content)

每层卡片标签分别为 chapter / node。

{existing}"""


async def _invoke_single_card(
    model_config_data: dict, prompt: str, timeout: int = 60,
) -> dict | None:
    llm = ModelFactory(model_config_data).main
    try:
        result = await asyncio.wait_for(
            llm.ainvoke([
                SystemMessage(content=CARD_SYSTEM_PROMPT),
                HumanMessage(content=prompt),
            ]),
            timeout=timeout,
        )
        content = result.content if hasattr(result, "content") else str(result)
        content = content.strip()
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        data = json.loads(content)

        card_data = None
        if isinstance(data, dict) and "cards" in data:
            items = data["cards"]
            card_data = items[0] if isinstance(items, list) and items else {}
        elif isinstance(data, list) and len(data) > 0:
            card_data = data[0]
        elif isinstance(data, dict):
            card_data = data

        if isinstance(card_data, dict) and card_data:
            title = card_data.get("title", card_data.get("name", ""))
            fields = card_data.get("fields", [])
            if not fields and not title:
                title = card_data.get("方案名称", "")
                fields = [
                    {"key": k, "value": str(v) if not isinstance(v, (dict, list)) else json.dumps(v, ensure_ascii=False)}
                    for k, v in card_data.items()
                    if k != "card_type" and k != "title" and k != "name"
                ]
            card = {
                "title": title,
                "fields": fields,
                "card_type": card_data.get("card_type", "creative_setting"),
            }
            return card

        logger.warning(
            f"[wizard] creative_setting card_data 无效, type={type(data).__name__}, "
            f"前200字={str(data)[:200]}"
        )
        return None
    except json.JSONDecodeError as e:
        logger.warning(
            f"[wizard] creative_setting JSON解析失败: {e}, "
            f"前200字={content[:200]}"
        )
        return None
    except Exception as e:
        logger.warning(f"[wizard] creative_setting 单卡调用失败: {type(e).__name__}: {e}")
        return None


async def generate_cards(
    step: str,
    model_config_data: dict | None,
    context: dict,
    requirements: str = "",
    batch_size: int = 4,
    extra: dict | None = None,
) -> dict:
    if not model_config_data:
        return {"cards": [], "step": step, "error": "请先在设置中配置模型"}

    prompt_template = STEP_PROMPTS[step]
    book = context.get("book", {})
    extra_context = _build_extra_context(context)

    requirements_section = ""
    if requirements.strip():
        requirements_section = f"\n额外要求：{requirements}"

    if step == "creative_setting":
        variation = extra.get("variation", "") if extra else ""
        if not variation:
            variation = "请提出一个有独特风格的方案。"
        prompt = prompt_template.format(
            title=book.get("title", "未知"),
            genre=book.get("genre", ""),
            description=book.get("description", ""),
            total_word_goal=book.get("total_word_goal", 0),
            extra_context=extra_context,
            requirements_section=requirements_section,
            variation=variation,
        )
        card = await _invoke_single_card(model_config_data, prompt, timeout=90)
        logger.info(f"[wizard] creative_setting 完成, card={'OK' if card else 'FAIL'}")
        return {"cards": [card] if card else [], "step": step}
    elif step == "outline":
        extra = extra or {}
        outline_prompt = _format_outline_prompt(
            context,
            extra.get("volume_count", 3),
            extra.get("chapters_per_volume", 5),
            extra.get("nodes_per_chapter", 3),
            extra.get("mode", "all"),
        )
        prompt = prompt_template.format(
            title=book.get("title", "未知"),
            genre=book.get("genre", ""),
            extra_context=extra_context,
            outline_specific=outline_prompt,
            batch_size=batch_size,
            requirements_section=requirements_section,
        )
    elif step == "character_relations":
        characters = (extra or {}).get("characters", context.get("characters", []))
        characters_text = "\n".join(
            f"- {c.get('name', '')}：{c.get('description', '')} ({c.get('role_type', '')})"
            for c in characters
        )
        prompt = prompt_template.format(
            characters_text=characters_text,
            requirements_section=requirements_section,
        )
    else:
        prompt = prompt_template.format(
            title=book.get("title", "未知"),
            genre=book.get("genre", ""),
            batch_size=batch_size,
            requirements_section=requirements_section,
            extra_context=extra_context,
        )

    main_cfg = model_config_data.get("main_config", {})
    llm = ModelFactory(model_config_data).main

    print(
        f"[wizard] {step} >>> 调用 LLM, model={main_cfg.get('model_id')}, prompt长度={len(prompt)}",
        flush=True,
    )
    try:
        result = await asyncio.wait_for(
            llm.ainvoke(
                [
                    SystemMessage(content=CARD_SYSTEM_PROMPT),
                    HumanMessage(content=prompt),
                ]
            ),
            timeout=120,
        )
    except asyncio.TimeoutError:
        print(f"[wizard] {step} >>> LLM 超时(120s)", flush=True)
        logger.error(f"[wizard] {step} LLM 调用超时")
        return {"cards": [], "step": step, "error": "模型调用超时，请重试"}
    print(f"[wizard] {step} >>> LLM 返回", flush=True)
    content = result.content if hasattr(result, "content") else str(result)
    print(
        f"[wizard] {step} >>> content长度={len(content)}, 前200字={content[:200]}",
        flush=True,
    )
    logger.info(
        f"[wizard] {step} LLM 返回 – 长度: {len(content)}, 前200字: {content[:200]}"
    )

    try:
        if "```json" in content:
            content = content.split("```json")[1].split("```")[0].strip()
        elif "```" in content:
            content = content.split("```")[1].split("```")[0].strip()
        data = json.loads(content)
        print(
            f"[wizard] {step} >>> JSON解析成功, 类型={type(data).__name__}", flush=True
        )
        logger.info(f"[wizard] {step} JSON 解析成功, 原始类型: {type(data).__name__}")
    except json.JSONDecodeError as e:
        print(f"[wizard] {step} >>> JSON解析失败: {e}", flush=True)
        logger.warning(
            f"[wizard] {step} JSON 解析失败: {e}, content前200: {content[:200]}"
        )
        return {"cards": [], "step": step, "error": f"JSON 解析失败: {str(e)}"}

    if isinstance(data, list):
        cards = [
            {
                "title": c.get("title", c.get("name", "")),
                "fields": c.get("fields", []),
                "card_type": c.get("card_type", "card"),
            }
            for c in data
        ]
    elif isinstance(data, dict) and "cards" in data:
        cards = data["cards"]
    else:
        logger.warning(f"[wizard] {step} 返回 JSON 格式不符合预期: {str(data)[:200]}")
        cards = []

    logger.info(f"[wizard] {step} 最终卡片数: {len(cards)}")
    return {"cards": cards, "step": step}
