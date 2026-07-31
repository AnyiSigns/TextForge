from datetime import timedelta, datetime, timezone
from typing import Any, Optional
from passlib.context import CryptContext
from jose import jwt, ExpiredSignatureError, JWTError
from config.settings import settings
from config.logging import get_logger

logger = get_logger(__name__)

hash_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def encode_pwd(pwd: str) -> str:
    """密码明文加密。

    Args:
        pwd: 明文密码。

    Returns:
        bcrypt 哈希字符串。
    """
    return hash_context.hash(pwd)


def verify_pwd(pwd: str, pwd_hash) -> bool:
    """密码验证。

    Args:
        pwd: 明文密码。
        pwd_hash: 哈希密码。

    Returns:
        验证成功返回 True，否则返回 False。
    """
    return hash_context.verify(pwd, pwd_hash)


def create_token(data: dict[str, Any], expire: Optional[timedelta | datetime] = None):
    """创建 JWT Token。

    Args:
        data: Token 载荷。
        expire: 过期时间，可选。

    Returns:
        JWT 字符串。
    """
    temp = data.copy()
    if expire:
        expire = datetime.now(timezone.utc) + expire  # type: ignore
    else:
        expire = datetime.now(timezone.utc) + settings.JWT_EXPIRE_TIME
    temp.update({"exp": expire})
    return jwt.encode(temp, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def verify_token(token):
    """验证 JWT Token。

    Args:
        token: JWT 字符串。

    Returns:
        解码后的 payload，无效或过期返回 None。
    """
    try:
        payload = jwt.decode(
            token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM]
        )
        return payload
    except ExpiredSignatureError:
        logger.warning("Token expired")
        return None
    except JWTError as e:
        logger.warning(f"令牌解析失败*{e}*")
        return None
    except Exception as e:
        logger.error(f"令牌异常*{e}*", exc_info=True)
        return None
