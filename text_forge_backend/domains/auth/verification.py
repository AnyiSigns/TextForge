import random
from config.settings import settings
from shared.redis import redis_client


class VerificationService:
    """邮箱验证码服务。

    基于 Redis 存储验证码，支持生成、保存与校验。
    """

    @staticmethod
    def generate_code() -> str:
        """生成 5 位数字验证码。

        Returns:
            5 位数字字符串。
        """
        return f"{random.randint(10000, 99999)}"

    @staticmethod
    async def save_code(email: str, code: str):
        """存储验证码到 Redis。

        Args:
            email: 邮箱地址。
            code: 验证码。
        """
        key = f"verification:{email}"
        await redis_client.setex(key, settings.CAPTCHA_TIME, code)

    @staticmethod
    async def verify_code(email, code: str):
        """校验验证码，成功后自动删除。

        Args:
            email: 邮箱地址。
            code: 待校验验证码。

        Returns:
            校验成功返回 True，否则返回 False。
        """
        key = f"verification:{email}"
        status_code = await redis_client.get(key)
        if status_code and status_code == code:
            await redis_client.delete(key)
            return True
        return False


verification = VerificationService()
verifacation = verification  # deprecated alias
