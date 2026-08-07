"""剧情流 — 场景生成与推演摘要提示词。

场景生成采用两段式输出：先叙事纯文本（流式转发给前端），随后单独一行
`###OPTIONS###` 分隔符，再输出 JSON 数组 `[{"text": "..."}]`（后端静默收集）。
"""
from typing import Any


def build_scene_prompt(
    book_title: str,
    chapter_title: str,
    chapter_summary: str,
    event_desc: str,
    decision_history: str,
    stage_label: str,
    view_character_name: str | None,
    user_input: str | None,
    last_event: bool,
) -> str:
    """构造单次场景生成的系统提示词。

    Args:
        book_title: 书名。
        chapter_title: 章节标题。
        chapter_summary: 章节摘要（可为空）。
        event_desc: 当前锚点事件的描述文本（标题/内容/出场角色/地点/关联伏笔/情节线），实时生成模式为「自由推演」。
        decision_history: 决策链历史原文（最近 6 节点 + 更早摘要行），空为「（推演刚开始）」。
        stage_label: 阶段标签，如「事件 2 / 5」或「第 3 幕」。
        view_character_name: 视角角色名（可为空，为空则无视角中心）。
        user_input: 用户自定义输入原文（可为空）。
        last_event: 是否最后一个锚点事件（引导剧情收束）。

    Returns:
        系统提示词字符串。
    """
    perspective_part = ""
    if view_character_name:
        perspective_part = (
            f"\n【视角中心】本次叙事以角色【{view_character_name}】为中心：以ta的所见所闻所感、行动为主线展开，"
            f"但仍使用第三人称叙述。叙事中提及该角色时一律使用其原名「{view_character_name}」，禁止使用「你」字。"
        )

    input_part = ""
    if user_input:
        input_part = (
            f"\n【用户行动】用户输入：{user_input}\n"
            f"用户输入中的「我/你」均指视角角色【{view_character_name or '主角'}】，请以其名义叙述这一行动及其后果。"
        )

    closing_part = ""
    if last_event:
        closing_part = "\n本幕是最后的事件锚点，请自然引导剧情收束，为本章结局铺垫。"

    return f"""你是小说章节剧情推演的叙事引擎。请根据给定的章节设定与事件骨架，生成一段沉浸式的小说场景叙事与后续行动选项。

【书籍】《{book_title}》
【章节】{chapter_title}
【章节摘要】{chapter_summary or '（无）'}
【本幕锚点】
{event_desc}
【阶段】{stage_label}
【决策链历史（此前已发生的剧情，需自然衔接）】
{decision_history}
{perspective_part}
{input_part}
{closing_part}

【输出要求（两段式，严格遵守）】
1. 先直接输出叙事纯文本（150~250 字），不使用任何 Markdown 标题或前缀，就是正文本身。若设定了视角中心，叙述围绕该角色的视角展开；严禁出现「你」字，视角角色一律使用原名。
2. 叙事结束后另起单独一行，输出分隔符 `###OPTIONS###`（独占一行，前后无其他字符）。
3. 分隔符之后输出 JSON 数组（不要 ```json 代码块标记，不要任何解释文字），格式如下：
[{{"text": "选项一（一句话描述一个可执行的行动，10~20字）"}}, {{"text": "选项二"}}, {{"text": "选项三"}}]
生成 2~3 个选项，选项要与当前情境契合、推动剧情发展。

严禁出现任何服务用语、AI 身份表述或跳出作品世界观的说明（如「作为AI」「有什么可以帮助您」「以上是我为你生成的」等），保持完全沉浸的小说叙事。"""


def build_summary_prompt(
    book_title: str,
    chapter_title: str,
    decision_chain_text: str,
    all_narrations: str,
) -> str:
    """构造推演摘要生成的系统提示词。

    Args:
        book_title: 书名。
        chapter_title: 章节标题。
        decision_chain_text: 决策链原文（场景标题 + 所选选项逐行）。
        all_narrations: 全部场景叙事原文拼接。

    Returns:
        系统提示词字符串。
    """
    return f"""你是小说创作助手。请把下面这段《{book_title}》「{chapter_title}」章节的交互式剧情推演，压缩为一段 300~500 字的推演摘要。

【决策链】
{decision_chain_text or '（无）'}
【场景叙事】
{all_narrations or '（无）'}

摘要要求：
1. 概括推演中发生的关键情节、重要对话与人物行动，保留所有出场角色的原名。
2. 摘要将作为后续章节正文生成的上游素材，需要信息密度高、可直接复用。
3. 只输出摘要正文，不要任何解释、标题或服务用语。"""


def fallback_summary_from_nodes(nodes: list[Any]) -> str:
    """LLM 失败时的摘要回退：决策链文本逐行拼接。

    Args:
        nodes: 按 seq 升序的节点列表（含 title / chosen_option）。

    Returns:
        回退摘要文本。
    """
    lines = []
    for n in nodes:
        if n.chosen_option:
            lines.append(f"{n.title}：{n.chosen_option}")
    return "\n".join(lines)
