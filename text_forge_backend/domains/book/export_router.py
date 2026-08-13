from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Path, Query
from sqlalchemy.ext.asyncio import AsyncSession

from core.auth import get_current
from shared.database import db_manager
from shared.ratelimit import rate_limit_export

from .export_service import ExportService

router = APIRouter(prefix="/books", tags=["Export"])


def export_db(session: AsyncSession = Depends(db_manager.get_db)) -> ExportService:
    return ExportService(session)


@router.get("/{book_id}/export")
async def export_book(
    user_id: Annotated[int, Depends(get_current)],
    book_id: Annotated[int, Path(description="书籍 ID")],
    service: Annotated[ExportService, Depends(export_db)],
    fmt: str = Query("md", pattern="^(md|txt|epub|pdf)$"),
    include_outline: bool = Query(False),
    include_characters: bool = Query(False),
    volume_ids: list[int] | None = Query(default=None),
    _rl: None = Depends(rate_limit_export),
):
    data = await service.export_book(
        user_id=user_id,
        book_id=book_id,
        fmt=fmt,
        include_outline=include_outline,
        include_characters=include_characters,
        volume_ids=volume_ids,
    )
    if not data:
        raise HTTPException(status_code=404, detail="书籍不存在")

    content = data["content"]
    if fmt == "md":
        media_type = "text/markdown; charset=utf-8"
    elif fmt == "txt":
        media_type = "text/plain; charset=utf-8"
    elif fmt == "epub":
        media_type = "application/epub+zip"
    elif fmt == "pdf":
        media_type = "application/pdf"
    else:
        media_type = "application/octet-stream"

    from fastapi.responses import Response
    from urllib.parse import quote

    # 文件名清洗：剥离引号/换行/路径分隔符，防 Content-Disposition 头注入
    safe_name = (
        data["file_name"]
        .replace('"', "")
        .replace("\r", "")
        .replace("\n", "")
        .replace("/", "-")
        .replace("\\", "-")
    )
    return Response(
        content=content,
        media_type=media_type,
        headers={
            "Content-Disposition": f"attachment; filename*=UTF-8''{quote(safe_name)}"
        },
    )
