from repository.base_repo import BaseRepository
from model.model import ModelConfig
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select


class ModelConfRepository(BaseRepository[ModelConfig]):
    def __init__(self, session: AsyncSession):
        self.session = session
        super().__init__(ModelConfig, session)

    async def create_model_config(self, user_id: int, model_conf: dict):
        instance = await self.add(
            user_id=user_id,
            main_config=model_conf["main_config"],
            compression=model_conf["compression"],
            router_config=model_conf["router_config"],
            tool_config=model_conf["tool_config"],
            vision_config=model_conf["vision_config"],
            embedding_config=model_conf["embedding_config"],
        )
        return instance

    async def update_model_config(self, user_id: int, model_conf: dict):
        stmt = select(ModelConfig).where(ModelConfig.user_id == user_id)
        result = await self.session.execute(stmt)
        instance = result.scalar_one_or_none()
        if instance:
            for key, value in model_conf.items():
                if key in ("id", "user_id"):
                    continue
                setattr(instance, key, value)
            await self.session.commit()
            await self.session.refresh(instance)
            return instance
        if not instance:
            instance = await self.create_model_config(user_id, model_conf)
        return instance

    async def query_user_model(self, user_id: int):
        stmt = select(ModelConfig).where(ModelConfig.user_id == user_id)
        instance = await self.session.execute(stmt)
        return instance.scalar_one_or_none()
