from fastapi import APIRouter, Response

router = APIRouter(prefix="/health", tags=["Health"])


@router.get("/")
async def health_status():
    return


@router.head("/", include_in_schema=False)
async def head_health():
    return Response(status_code=200)
