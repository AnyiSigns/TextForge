from datetime import timedelta
from pathlib import Path
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
    JWT_SECRET_KEY: str = "$2b$12$fD2PIzcMsv6GH5kuYKx3teR3dzKHXdVE"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TIME: timedelta = timedelta(minutes=15)
    JWT_EXPIRE_TIME: timedelta = timedelta(days=7)

    # 数据库
    AUTO_CREATE_TABLES: bool = True
    POSTGRES_GRAPH_URL: str = "postgresql://postgres:1234@localhost:5433/text_forge"
    POSTGRES_DB_URL: str = (
        "postgresql+asyncpg://postgres:1234@localhost:5433/text_forge"
    )

    # email config
    EMAIL_SERVER: str = "smtp.yeah.net"
    EMAIL_PORT: int = 465
    EMAIL_USERNAME: str = "anyiSigns@yeah.net"
    EMAIL_PASSWORD: str = "USVrDmdWJwHDL35k"
    EMAIL_FROM: str = "anyiSigns@yeah.net"
    EMAIL_START_TLS: bool = False
    EMAIL_USE_TSL: bool = True
    EMAIL_TIME_OUT: int = 30
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


settings = Settings()
