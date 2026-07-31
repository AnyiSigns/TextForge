from fastapi import APIRouter, Depends, HTTPException
from typing import Annotated
from schema.request.model import ModelRequest
from schema.response.model import ModelResponse
from core.auth import get_current
from domains.model.service import ModelService, model_db

router = APIRouter(prefix="/models", tags=["Model"])


@router.post("/config")
async def save_model_conf(
    request: ModelRequest,
    user_id: Annotated[int, Depends(get_current)],
    user_serve: Annotated[ModelService, Depends(model_db)],
):
    instance = await user_serve.save_user_model(request.model_dump(), user_id)
    if not instance:
        raise HTTPException(status_code=400, detail="模型配置无效")
    return {"ok": 200}


@router.get("/config", response_model=ModelResponse)
async def query_model_conf(
    user_id: Annotated[int, Depends(get_current)],
    user_serve: Annotated[ModelService, Depends(model_db)],
):
    instance = await user_serve.query_user_model(user_id)
    if not instance:
        return ModelResponse()
    try:
        return ModelResponse.model_validate(instance)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"{e}")
