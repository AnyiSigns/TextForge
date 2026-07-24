from typing import Annotated
from infrastructure.database import db_manager
from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession
from repository.project_repo import (
    CharacterRepository,
    ProjectRepository,
    StepRepository,
    BriefRepository,
)
from model.project import Project
from utils.logger import get_logger

logger = get_logger(__name__)


class ProjectService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.project_repo = ProjectRepository(session)
        self.step_repo = StepRepository(session)
        self.character_repo = CharacterRepository(session)
        self.brief_repo = BriefRepository(session)

    async def query_user_project(self, user_id: int, **kwargs):
        """查询用户项目"""
        try:
            result = await self.project_repo.by_user_parameter_project(
                user_id, **kwargs
            )
            if not result:
                return []
            return result

        except Exception:
            logger.error("查询错误", exc_info=True)
            return []

    async def create_project(self, **kwargs):
        try:
            instance = await self.project_repo.add(**kwargs)
            version = (instance.version or 0) + 1
            instance.version = version
            return instance

        except Exception:
            logger.error("创建新项目失败", exc_info=True)
            return None

    async def project_characters(self, user_id: int, project_id: int):
        """获取项目角色列表"""
        try:
            result = await self.character_repo.project_character_detail(
                user_id, project_id
            )
            return result, None
        except Exception:
            logger.error("获取角色列表失败", exc_info=True)
            return None, "获取角色列表失败"

    async def project_info(self, user_id: int, project_id: int):
        """获取项目基本详情"""
        try:
            result = await self.project_repo.by_user_project(user_id, project_id)
            return result, None
        except Exception:
            logger.error("获取用户项目失败", exc_info=True)
            return None, "获取项目失败"

    async def project_detail(self, user_id: int, project_id: int):
        """获取项目完整详情"""
        try:
            project_data, _ = await self.project_info(user_id, project_id)
            step_data = await self.step_repo.step_detail(project_id)
            character_data, _ = await self.project_characters(user_id, project_id)
            result = {
                "project": project_data,
                "steps": step_data,
                "characters": character_data or [],
            }
            return result
        except Exception:
            logger.error("获取项目详情失败", exc_info=True)
            return {}

    async def update_project(self, project_id: int, **kwargs):
        """更新项目详情"""
        instance = await self.project_repo.update_project(project_id, **kwargs)
        if not instance:
            return None
        return instance

    async def delete_project(self, user_id: int, project_id: int):
        instance = await self.project_repo.get(project_id)
        if instance.user_id != user_id:
            return False
        try:
            await self.project_repo.delete(project_id)
            return True
        except Exception:
            logger.error("项目删除失败", exc_info=True)
            return False

    async def update_content(
        self, user_id: int, project_id: int, step_id: int, content: str
    ):
        """更新某一步正文"""
        try:
            result, msg = await self.project_info(user_id, project_id)
            if msg:
                return None, "获取项目失败"
            instance = await self.step_repo.update_content(step_id, content)
            if instance.project_id != result.id:
                return None, "修改失败"
            return instance, None
        except Exception:
            logger.error("正文修改失败", exc_info=True)
            return None, "正文修改失败"

    async def step_status(self, _user_id: int, project_id: int, step_id: int, status):
        instance = await self.step_repo.update_status(step_id, status)
        if instance.project_id != project_id:
            return False
        return True

    async def save_brief(self, project_id: int, _user_id: int, brief):
        try:
            instance = await self.brief_repo.save_brief(brief.model_dump())
            if instance.project_id != project_id:
                return False
            return True
        except Exception:
            logger.error("设定保存失败", exc_info=True)
            return False


async def project_db(db: Annotated[AsyncSession, Depends(db_manager.get_db)]):
    return ProjectService(db)
