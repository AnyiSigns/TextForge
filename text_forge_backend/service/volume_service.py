from core.exceptions import AppException
from fastapi import Depends
from shared.database import db_manager
from repository.volume_repo import VolumeRepository
from sqlalchemy.ext.asyncio import AsyncSession
from config.logging import get_logger

logger = get_logger(__name__)


class VolumeService:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.volume_repo = VolumeRepository(session)

    async def list_volumes(self, book_id: int):
        try:
            return await self.volume_repo.list_volumes(book_id)
        except Exception:
            logger.error("获取卷列表失败", exc_info=True)
            raise AppException(
                status_code=500,
                detail="获取卷列表失败",
                error_code="LIST_VOLUMES_FAILED",
            )

    async def get_volume(self, book_id: int, volume_id: int):
        try:
            result = await self.volume_repo.get_volume(book_id, volume_id)
            if not result:
                raise AppException(
                    status_code=404, detail="卷不存在", error_code="VOLUME_NOT_FOUND"
                )
            return result
        except AppException:
            raise
        except Exception:
            logger.error("获取卷失败", exc_info=True)
            raise AppException(
                status_code=500, detail="获取卷失败", error_code="GET_VOLUME_FAILED"
            )

    async def create_volume(self, book_id: int, **data):
        try:
            return await self.volume_repo.create_volume(book_id, **data)
        except Exception:
            logger.error("创建卷失败", exc_info=True)
            raise AppException(
                status_code=500, detail="创建卷失败", error_code="CREATE_VOLUME_FAILED"
            )

    async def update_volume(self, volume_id: int, **data):
        try:
            instance = await self.volume_repo.get(volume_id)
            if not instance:
                raise AppException(
                    status_code=404, detail="卷不存在", error_code="VOLUME_NOT_FOUND"
                )
            for key, value in data.items():
                if value is not None:
                    setattr(instance, key, value)
            await self.session.commit()
            await self.session.refresh(instance)
            return instance
        except AppException:
            raise
        except Exception:
            logger.error("更新卷失败", exc_info=True)
            raise AppException(
                status_code=500, detail="更新卷失败", error_code="UPDATE_VOLUME_FAILED"
            )

    async def delete_volume(self, volume_id: int):
        try:
            instance = await self.volume_repo.get(volume_id)
            if not instance:
                raise AppException(
                    status_code=404, detail="卷不存在", error_code="VOLUME_NOT_FOUND"
                )
            await self.volume_repo.delete_volume(volume_id)
            return True
        except AppException:
            raise
        except Exception:
            logger.error("删除卷失败", exc_info=True)
            raise AppException(
                status_code=500, detail="删除卷失败", error_code="DELETE_VOLUME_FAILED"
            )


async def volume_db(db: AsyncSession = Depends(db_manager.get_db)):
    return VolumeService(db)
