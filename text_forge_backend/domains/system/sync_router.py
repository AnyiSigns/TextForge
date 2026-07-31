from fastapi import APIRouter, Query

router = APIRouter(tags=["Sync"])


@router.get("/sync")
async def sync_data(
    since: str = Query(default="", description="时间戳，仅返回此时间之后的更新"),
    store: str = Query(default="default", description="存储类型"),
):
    return {"updates": [], "version": 1}
