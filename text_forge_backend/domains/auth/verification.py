import secrets

from config.settings import settings
from shared.redis import redis_client

RATE_LIMIT_WINDOW = 60
RATE_LIMIT_MAX = 5


class VerificationService:
    """邮箱验证码服务。

    基于 Redis 存储验证码，支持生成、保存与校验，同时提供发送频率限制。
    """

    @staticmethod
    def generate_code() -> str:
        """生成 6 位数字验证码。

        Returns:
            6 位数字字符串。
        """
        return f"{secrets.randbelow(900000) + 100000:06d}"

    @staticmethod
    async def is_rate_limited(email: str) -> bool:
        """检查邮箱是否处于发送频率限制。

        Args:
            email: 邮箱地址。

        Returns:
            超出频率返回 True，表示被限流。
        """
        key = f"verification:rate:{email}"
        count = await redis_client.incr(key)
        if count == 1:
            await redis_client.expire(key, RATE_LIMIT_WINDOW)
        return count > RATE_LIMIT_MAX

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
