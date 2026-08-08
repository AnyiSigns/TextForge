from sqlalchemy import select

from config.logging import get_logger
from models.workflow import Workflow

logger = get_logger(__name__)

BUILTIN_WORKFLOWS = [
    {
        "id": "builtin-xianxia-light-pipeline",
        "user_id": None,
        "name": "网文三件套",
        "description": "执笔写手 → 设定合规审计 → 总编仲裁官，适合快节奏网文",
        "builtin": True,
        "nodes": [
            {
                "id": "writer",
                "label": "执笔写手",
                "executor": "main",
                "system_prompt": "你是专业的小说执笔写手。职责：根据策划书和分镜表，写出指定章节的完整正文。要求：保持与前文一致的人设和世界观，文风自然流畅。若上下文中含「角色支线」素材（角色模拟沉淀的设定/冲突/台词），优先参考并自然融入正文。直接输出正文。",
                "context_fields": ["chapter_summaries", "characters", "locations", "recent_chapters", "branches", "book_info"],
                "config": {},
            },
            {
                "id": "compliance",
                "label": "设定合规审计",
                "executor": "audit",
                "system_prompt": "你是设定合规审计师。职责：逐条检查正文中的人物是否人设崩塌（性格/能力/关系）；检查地理描写是否与设定矛盾；检查世界观特殊规则是否被违反。输出审计报告：PASS或FAIL+违规项+修改建议。",
                "context_fields": ["characters", "locations", "creative_settings", "chapter_content", "book_info"],
                "config": {},
            },
            {
                "id": "chief",
                "label": "总编仲裁官",
                "executor": "audit",
                "system_prompt": "你是总编仲裁官。职责：阅读执行层和审计层的全部输出，做出最终裁决。当审计发现冲突时判断是否需要重写；当两条审计结果矛盾时做出取舍。输出：APPROVED/REVISE，含裁决理由。",
                "context_fields": ["book_info"],
                "config": {},
            },
        ],
        "edges": [
            {"from": "writer", "to": "compliance"},
            {"from": "compliance", "to": "chief"},
        ],
    },
    {
        "id": "builtin-elaborate-literature",
        "user_id": None,
        "name": "精雕文学",
        "description": "7角色全阵容：战略策划官→场景分镜师→执笔写手→（文风润色师+双审计）→总编仲裁官",
        "builtin": True,
        "nodes": [
            {
                "id": "strategist",
                "label": "战略策划官",
                "executor": "main",
                "system_prompt": "你是小说创作的战略策划官。职责：分析当前大纲和情节线进度，决定故事前进方向；调整章节顺序和卷结构；选定当前需强化的情节线，标注重点章节。输出'战略策划书'，包含本阶段目标、推进线索、关键冲突点、章节分配建议。",
                "context_fields": ["outline_structure", "plot_threads", "foreshadowings", "characters", "branches", "book_info"],
                "config": {},
            },
            {
                "id": "storyboard",
                "label": "场景分镜师",
                "executor": "main",
                "system_prompt": "你是场景分镜师。职责：根据大纲和策划书，将每章拆解为3~5个具体场景；为每个场景确定视角角色、地点、冲突类型；控制场景节奏。输出'分镜表'：按章列出场景清单，含标题+冲突+角色+地点+预计字数。",
                "context_fields": ["chapter_summaries", "scene_events", "locations", "characters", "branches", "book_info"],
                "config": {},
            },
            {
                "id": "writer",
                "label": "执笔写手",
                "executor": "main",
                "system_prompt": "你是专业的小说执笔写手。职责：根据策划书和分镜表，写出指定章节的完整正文。要求：保持与前文一致的人设和世界观，文风自然流畅。若上下文中含「角色支线」素材（角色模拟沉淀的设定/冲突/台词），优先参考并自然融入正文。直接输出正文。",
                "context_fields": ["recent_chapters", "characters", "locations", "chapter_content", "branches", "book_info"],
                "config": {},
            },
            {
                "id": "polish",
                "label": "文风润色师",
                "executor": "main",
                "system_prompt": "你是文风润色师。职责：检查正文的语感和节奏，调整生硬句子；确保文风与创作设定中的tone一致；优化对话自然度、场景过渡、情绪渲染。输出润色后完整正文。禁止改变情节和人物设定。",
                "context_fields": ["creative_settings", "chapter_content", "recent_chapters", "book_info"],
                "config": {},
            },
            {
                "id": "compliance",
                "label": "设定合规审计",
                "executor": "audit",
                "system_prompt": "你是设定合规审计师。职责：逐条检查正文中的人物是否人设崩塌（性格/能力/关系）；检查地理描写是否与设定矛盾；检查世界观特殊规则是否被违反。输出审计报告：PASS或FAIL+违规项+修改建议。",
                "context_fields": ["characters", "locations", "creative_settings", "chapter_content", "book_info"],
                "config": {},
            },
            {
                "id": "plot",
                "label": "线索伏笔审计",
                "executor": "audit",
                "system_prompt": "你是线索伏笔审计师。职责：检查正文是否推进了当前进行中的情节线；检查是否有应该在此章回收的伏笔被遗漏；检查前后因果关系是否合理。输出审计报告：PASS或FAIL+逻辑漏洞+建议。",
                "context_fields": ["plot_threads", "foreshadowings", "scene_events", "chapter_content", "branches", "book_info"],
                "config": {},
            },
            {
                "id": "chief",
                "label": "总编仲裁官",
                "executor": "audit",
                "system_prompt": "你是总编仲裁官。职责：阅读执行层和审计层的全部输出，做出最终裁决。当审计发现冲突时判断是否需要重写；当两条审计结果矛盾时做出取舍。输出：APPROVED/REVISE，含裁决理由。",
                "context_fields": ["book_info"],
                "config": {},
            },
        ],
        "edges": [
            {"from": "strategist", "to": "storyboard"},
            {"from": "storyboard", "to": "writer"},
            {"from": "writer", "to": "polish"},
            {"from": "writer", "to": "compliance"},
            {"from": "writer", "to": "plot"},
            {"from": "polish", "to": "chief"},
            {"from": "compliance", "to": "chief"},
            {"from": "plot", "to": "chief"},
        ],
    },
    {
        "id": "builtin-quick-write",
        "user_id": None,
        "name": "速写模式",
        "description": "执笔写手 → 文风润色师，快速产出",
        "builtin": True,
        "nodes": [
            {
                "id": "writer",
                "label": "执笔写手",
                "executor": "main",
                "system_prompt": "你是专业的小说执笔写手。职责：根据策划书和分镜表，写出指定章节的完整正文。要求：保持与前文一致的人设和世界观，文风自然流畅。若上下文中含「角色支线」素材（角色模拟沉淀的设定/冲突/台词），优先参考并自然融入正文。直接输出正文。",
                "context_fields": ["recent_chapters", "characters", "locations", "branches", "book_info"],
                "config": {},
            },
            {
                "id": "polish",
                "label": "文风润色师",
                "executor": "main",
                "system_prompt": "你是文风润色师。职责：检查正文的语感和节奏，调整生硬句子；确保文风与创作设定中的tone一致；优化对话自然度、场景过渡、情绪渲染。输出润色后完整正文。禁止改变情节和人物设定。",
                "context_fields": ["creative_settings", "chapter_content", "recent_chapters", "book_info"],
                "config": {},
            },
        ],
        "edges": [
            {"from": "writer", "to": "polish"},
        ],
    },
]


async def seed_builtin_workflows(session):
    try:
        existing_ids = {row[0] for row in (await session.execute(select(Workflow.id).where(Workflow.builtin == True))).all()}
        for item in BUILTIN_WORKFLOWS:
            if item["id"] in existing_ids:
                continue
            session.add(Workflow(**item))
        await session.commit()
        logger.info("内置工作流模板初始化完成")
    except Exception:
        logger.error("内置工作流模板初始化失败", exc_info=True)
