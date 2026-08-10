from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
import ssl

import aiosmtplib
import certifi
from pydantic import EmailStr

from config.logging import get_logger
from config.settings import settings

logger = get_logger(__name__)

# 显式使用 certifi 的 CA 根证书包，避免独立 venv 环境找不到系统 CA
# 导致连接 smtp 时 TLS 证书验证失败（CERTIFICATE_VERIFY_FAILED）。
try:
    _tls_context = ssl.create_default_context(cafile=certifi.where())
except Exception:
    _tls_context = ssl.create_default_context()


class EmailService:
    @staticmethod
    async def send_verification_email(to_email: EmailStr, code: str):
        """发送邮箱验证码"""
        message = MIMEMultipart("alternative")
        message["Subject"] = "您的验证码"
        message["From"] = settings.EMAIL_FROM
        message["To"] = to_email

        text_part = MIMEText(
            f"您的验证码是:{code},有效期{settings.CAPTCHA_TIME/60}分钟."
        )
        message.attach(text_part)

        try:
            await aiosmtplib.send(
                message,
                hostname=settings.EMAIL_SERVER,
                port=settings.EMAIL_PORT,
                username=settings.EMAIL_USERNAME,
                password=settings.EMAIL_PASSWORD,
                use_tls=settings.EMAIL_USE_TLS,
                start_tls=settings.EMAIL_START_TLS,
                timeout=settings.EMAIL_TIME_OUT,
                tls_context=_tls_context,
            )
            return True
        except Exception as e:
            logger.error(f"邮件发送失败：{e}")
            return False


email_service = EmailService()
