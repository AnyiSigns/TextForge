from datetime import timedelta
from pathlib import Path
from pydantic_settings import BaseSettings,SettingsConfigDict

def get_abs_path(path:str)->str:
    """获取绝对路径"""
    root_dir = Path(__file__).resolve().parent.parent.parent
    return str(root_dir / path.lstrip("/"))


class Settings(BaseSettings):
    #日志
    LOG_LEVEL: str = "INFO"
    LOG_FORMAT: str = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    LOG_DATE_FORMAT: str = "%Y-%m-%d %H:%M:%S"
    LOG_FILE_PATH: str = get_abs_path("logs/app.log")

    #jwt
    JWT_SECRET_KEY: str = "$2b$12$fD2PIzcMsv6GH5kuYKx3teR3dzKHXdVE"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRE_TIME: timedelta = timedelta(days=7)

    #数据库
    AUTO_CREATE_TABLES:bool=True
    POSTGRES_GRAPH_URL:str="postgresql://postgres:1234@localhost:5432/text_forge"
    POSTGRES_DB_URL:str="postgresql+asyncpg://postgres:1234@localhost:5432/text_forge"

    # 模型
    DASHSCOPE_MODEL:str= "glm-5.1"
    DASHSCOPE_BASE_URL:str= "https://ws-6rnv50cb3kvs261t.cn-beijing.maas.aliyuncs.com/compatible-mode/v1"
    DASHSCOPE_API_KEY:str= "sk-da98029948304384b660c0f07656e020"
    DASHSCOPE_TEXT_MODEL:str= "text-embedding-v4"

    model_config=SettingsConfigDict(
        env_file=get_abs_path(".env"),
        env_file_encoding="utf-8",
        #严格区分大小写
        case_sensitive=True
    )

settings=Settings()