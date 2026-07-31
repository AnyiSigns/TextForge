from fastapi import APIRouter, Depends, Query
from core.auth import get_current
from typing import Annotated

router = APIRouter(prefix="/sync", tags=["Sync"])


@router.get("/")
async def sync_updates(
    user_id: Annotated[int, Depends(get_current)],
    since: Annotated[str, Query(description="上次同步时间戳")] = "1970-01-01T00:00:00.000Z",
    store: Annotated[str, Query(description="同步存储类型")] = "models",
):
    if store == "models":
        return {"updates": [], "version": 1}
    return {"updates": [], "version": 1}
