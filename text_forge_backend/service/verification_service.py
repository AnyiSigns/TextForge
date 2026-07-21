import random
from config.settings import settings
from config.redis_config import redis_client


class VerificationService:
    @staticmethod
    def generate_code() -> str:
        """生成验证码"""
        return f"{random.randint(10000, 99999)}"

    @staticmethod
    async def save_code(email: str, code: str):
        """存储验证码"""
        key = f"verification:{email}"
        await redis_client.setex(key, settings.CAPTCHA_TIME, code)

    @staticmethod
    async def verify_code(email, code: str):
        """验证验证码"""
        key = f"verification:{email}"
        status_code = await redis_client.get(key)
        if status_code and status_code.decode() == code:  # type: ignore
            await redis_client.delete(key)  # 验证通过立马删除验证码
            return True
        return False


verifacation = VerificationService()
