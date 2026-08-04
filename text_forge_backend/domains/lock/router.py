from typing import Annotated

from config.logging import get_logger
from core.auth import get_current
from fastapi import APIRouter, Depends, HTTPException
from shared.database import db_manager
from shared.lock_guard import set_lock
from sqlalchemy.ext.asyncio import AsyncSession

logger = get_logger(__name__)

router = APIRouter(prefix="/lock", tags=["Lock"])


@router.post("/{entity_type}/{entity_id}")
async def toggle_lock(
    entity_type: str,
    entity_id: int,
    user_id: Annotated[int, Depends(get_current)],
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    valid_types = {"characters", "locations", "foreshadowings", "plot_threads", "scene_events", "creative_settings"}
    if entity_type not in valid_types:
        raise HTTPException(status_code=400, detail=f"无效的实体类型: {entity_type}")

    current_locked = False
    try:
        from shared.lock_guard import is_locked, validate_ownership
        is_owner = await validate_ownership(session, entity_type, entity_id, user_id)
        if not is_owner:
            raise HTTPException(status_code=403, detail="无权操作此实体")
        current_locked = await is_locked(session, entity_type, entity_id)
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(f"检查锁定状态失败: {exc}")
        raise HTTPException(status_code=500, detail="服务器错误")

    success = await set_lock(session, entity_type, entity_id, not current_locked)
    if not success:
        raise HTTPException(status_code=404, detail="实体不存在")

    return {
        "entity_type": entity_type,
        "entity_id": entity_id,
        "locked": not current_locked,
    }
