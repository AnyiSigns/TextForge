from fastapi import APIRouter
from fastapi.responses import Response

router = APIRouter(tags=["Health"])


@router.get("/health")
async def health_check():
    return {}


@router.head("/health", include_in_schema=False)
async def health_head():
    return Response(status_code=200)
