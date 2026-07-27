from openai import project
from sqlalchemy import select
from repository.base_repo import BaseRepository
from sqlalchemy.ext.asyncio import AsyncSession
from model.project import Brief, Character, Project


class ProjectRepository(BaseRepository[Project]):
    def __init__(self, session: AsyncSession):
        self.session = session
        super().__init__(Project, session)

    async def by_user_parameter_project(self, user_id: int, **kwargs):
        field_map = {"status": Project.status, "genre": Project.genre}
        parameter = []
        for key, value in kwargs.items():
            if value is not None:
                parameter.append(field_map[key] == value)
        stmt = select(Project).where(Project.user_id == user_id, *parameter)
        result = await self.session.execute(stmt)
        return result.scalars().all()

    async def by_user_project(self, user_id: int, project_id: int):
        """获取用户某一项目"""
        stmt = select(Project).where(
            Project.user_id == user_id, Project.id == project_id
        )
        result = await self.session.execute(stmt)
        return result.scalar_one_or_none()

    async def update_project(self, project_id: int, **kwargs) -> Project | None:
        result = await self.update(project_id, **kwargs)
        return result


class CharacterRepository(BaseRepository[Character]):
    def __init__(self, session: AsyncSession):
        self.session = session
        super().__init__(Character, session)

    async def project_character_detail(self, user_id: int, project_id: int):
        """获取用户该项目角色"""
        stmt = select(Character).where(
            Character.user_id == user_id, Character.project_id == project_id
        )
        result = await self.session.execute(stmt)
        return result.scalars().all()


class BriefRepository(BaseRepository[Brief]):
    def __init__(self, session: AsyncSession):
        self.session = session
        super().__init__(Brief, session)

    async def add_brief(self, project_id: int, brief: dict):
        instance = await self.add(project_id=project_id, **brief)
        return instance

    async def save_brief(self, project_id: int, brief: dict):
        instance = await self.get(project_id)
        if not instance:
            instance = await self.add_brief(project_id, brief)
            return instance
        instance = await self.update(project_id, **brief)
        return instance

    async def get_brief(self, project_id: int):
        """获取项目设定"""
        return await self.get(project_id)
