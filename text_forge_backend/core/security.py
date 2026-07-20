from datetime import timedelta, datetime, timezone
from typing import Any, Optional
from passlib.context import CryptContext
from jose import jwt,ExpiredSignatureError,JWTError
from config.settings import settings
from utils.logger import get_logger



logger = get_logger(__name__)

hash_context=CryptContext(
    schemes=["bcrypt"],
    deprecated="auto"
)

def encode_pwd(pwd:str)->str:
    """密码明文加密"""
    return hash_context.hash(pwd)

def verify_pwd(pwd:str,pwd_hash)->bool:
    """密码验证"""
    return hash_context.verify(pwd,pwd_hash)

def create_token(data:dict[str,Any],expire:Optional[timedelta]=None):
    """创建token"""
    temp=data.copy()
    if expire:
        expire=datetime.now(timezone.utc)+expire
    else:
        expire=datetime.now(timezone.utc)+settings.JWT_EXPIRE_TIME
    temp.update({"exp":expire})
    return jwt.encode(temp,settings.JWT_SECRET_KEY,algorithm=settings.JWT_ALGORITHM)

def verify_token(token):
    """验证token"""
    try:
        payload=jwt.decode(token,settings.JWT_SECRET_KEY,algorithms=[settings.JWT_ALGORITHM])
        return payload
    except ExpiredSignatureError:
        logger.warning("Token expired")
        return None
    except JWTError as e:
        logger.warning(f"令牌解析失败*{e}*")
        return None
    except Exception as e:
        logger.error(f"令牌异常*{e}*",exc_info=True)
        return None




