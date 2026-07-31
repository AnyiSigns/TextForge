from typing import Annotated
from infrastructure.database import db_manager
from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from utils.logger import get_logger
from repository.workflow import WorkflowRepository

logger = get_logger(__name__)


class WorkflowService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.workflow_repo = WorkflowRepository(session)

    async def get_list_workflow(self, user_id: int):
        try:
            result = await self.workflow_repo.get_list_workflow(user_id)
            if not result:
                return []
            return result
        except Exception:
            logger.error("获取流水线列表出错", exc_info=True)
            return []

    async def get_workflow_detail(self, workflow_id: str, user_id: int):
        try:
            instance = await self.workflow_repo.get_workflow_id(workflow_id, user_id)
            if not instance:
                raise HTTPException(status_code=404, detail="流水线不存在")
            return instance
        except HTTPException:
            raise
        except Exception:
            logger.error("获取流水线详情失败", exc_info=True)
            raise HTTPException(status_code=500, detail="获取流水线详情异常")

    async def put_workflow(self, workflow_id: str, user_id: int, updata: dict):
        try:
            instance = await self.workflow_repo.put_workflow(
                workflow_id, user_id, updata
            )
            if not instance:
                raise HTTPException(status_code=404, detail="资源未找到")
            return instance
        except HTTPException:
            raise
        except Exception as e:
            logger.error("流水线异常", exc_info=True)
            raise HTTPException(status_code=500, detail=f"{e}")

    async def delete_workflow(self, workflow_id: str, _user_id: int):
        try:
            status = await self.workflow_repo.delete_user_in_workflow(workflow_id)
            if status:
                return status
            else:
                raise HTTPException(status_code=404, detail="资源删除失败")
        except HTTPException:
            raise
        except Exception as e:
            logger.error("删除异常", exc_info=True)
            raise HTTPException(status_code=500, detail=f"{e}")


async def workflow_db(db: Annotated[AsyncSession, Depends(db_manager.get_db)]):
    return WorkflowService(db)
