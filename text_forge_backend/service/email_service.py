import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from pydantic import EmailStr
from config.settings import settings


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
                use_tls=settings.EMAIL_USE_TSL,
                start_tls=settings.EMAIL_START_TLS,
                timeout=settings.EMAIL_TIME_OUT,
            )
            return True
        except Exception as e:
            print(f"邮件发送失败：{e}")
            return False


email_service = EmailService()
