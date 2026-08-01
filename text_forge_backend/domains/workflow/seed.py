from config.logging import get_logger
from models.workflow import Workflow
from sqlalchemy import select

logger = get_logger(__name__)

BUILTIN_WORKFLOWS = [
    {
        "id": "builtin-fast-paced-web-novel",
        "user_id": None,
        "name": "快节奏网文",
        "description": "适合快节奏网文，短句+高频冲突",
        "builtin": True,
        "nodes": [
            {"id": "main", "type": "main", "label": "写手", "executor": "main", "config": {}},
            {"id": "audit", "type": "audit", "label": "校对", "executor": "audit", "config": {}},
        ],
        "edges": [
            {"from": "main", "to": "audit"},
        ],
        },
    {
        "id": "builtin-serious-literature",
        "user_id": None,
        "name": "严肃文学",
        "description": "适合严肃文学，细节丰富，策划→写手→校对→压缩",
        "builtin": True,
        "nodes": [
            {"id": "tool", "type": "tool", "label": "策划", "executor": "tool", "config": {}},
            {"id": "main", "type": "main", "label": "写手", "executor": "main", "config": {}},
            {"id": "audit", "type": "audit", "label": "校对", "executor": "audit", "config": {}},
            {"id": "compression", "type": "compression", "label": "压缩", "executor": "auto", "config": {}},
        ],
        "edges": [
            {"from": "tool", "to": "main"},
            {"from": "main", "to": "audit"},
            {"from": "audit", "to": "compression"},
        ],
    },
    {
        "id": "builtin-light-novel",
        "user_id": None,
        "name": "轻小说",
        "description": "适合轻小说，对话为主，策划→写手",
        "builtin": True,
        "nodes": [
            {"id": "tool", "type": "tool", "label": "策划", "executor": "tool", "config": {}},
            {"id": "main", "type": "main", "label": "写手", "executor": "main", "config": {}},
        ],
        "edges": [
            {"from": "tool", "to": "main"},
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
