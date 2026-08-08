from datetime import timedelta
from pathlib import Path

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


def get_abs_path(path: str) -> str:
    """获取绝对路径"""
    root_dir = Path(__file__).resolve().parent.parent
    return str(root_dir / path.lstrip("/"))


class Settings(BaseSettings):
    """应用配置。

    从环境变量或 .env 文件加载，覆盖默认值。
    """

    # 日志
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    LOG_DATE_FORMAT: str = "%Y-%m-%d %H:%M:%S"
    LOG_FILE_PATH: str = get_abs_path("logs/app.log")

    # jwt
    # 注意：密钥不能硬编码在源码中，必须通过 .env 提供（gitignored）。
    # 缺失或过短时启动直接报错，防止生产环境使用默认密钥被伪造 token。
    JWT_SECRET_KEY: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TIME: timedelta = timedelta(minutes=15)
    JWT_EXPIRE_TIME: timedelta = timedelta(days=7)

    # 数据库
    AUTO_CREATE_TABLES: bool = True
    # SQLAlchemy 是否打印每条 SQL。默认关闭，避免淹没 agent/workflow 业务日志；
    # 需要排查 SQL 时在 .env 设 SQL_ECHO=true。
    SQL_ECHO: bool = False
    # 注意：数据库连接串不能硬编码弱口令，必须在 .env 提供（gitignored）。
    POSTGRES_GRAPH_URL: str = ""
    POSTGRES_DB_URL: str = ""

    # email config
    EMAIL_SERVER: str = "smtp.yeah.net"
    EMAIL_PORT: int = 465
    EMAIL_USERNAME: str = ""
    EMAIL_PASSWORD: str = ""
    EMAIL_FROM: str = ""
    EMAIL_START_TLS: bool = False
    # 兼容旧 .env 的 EMAIL_USE_TSL 拼写（历史笔误），新配置统一用 EMAIL_USE_TLS
    EMAIL_USE_TLS: bool = Field(
        default=True,
        validation_alias=AliasChoices("EMAIL_USE_TLS", "EMAIL_USE_TSL"),
    )
    EMAIL_TIME_OUT: int = 30  # 邮件发送超时时间，30秒
    CAPTCHA_TIME: int = 300

    # redis config
    REDIS_HOST: str = "localhost"
    REDIS_PORT: int = 6379
    REDIS_DB: int = 0

    # env
    ENV: str = "development"
    ALLOWED_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    STATIC_URL: str = get_abs_path("/static")

    model_config = SettingsConfigDict(
        env_file=get_abs_path(".env"),
        env_file_encoding="utf-8",
        # 严格区分大小写
        case_sensitive=True,
    )

    @model_validator(mode="after")
    def _validate_secrets(self) -> "Settings":
        """配置安全校验：密钥与数据库连接串必须来自 .env，禁止使用空默认值。"""
        if not self.JWT_SECRET_KEY or len(self.JWT_SECRET_KEY) < 16:
            raise ValueError(
                "JWT_SECRET_KEY 未配置或长度不足 16 字符，请在 .env 中设置。"
            )
        if not self.POSTGRES_DB_URL or not self.POSTGRES_GRAPH_URL:
            raise ValueError(
                "POSTGRES_DB_URL / POSTGRES_GRAPH_URL 未配置，请在 .env 中设置。"
            )
        return self


settings = Settings()
