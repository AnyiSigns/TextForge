import logging
import os
import sys
from logging.handlers import RotatingFileHandler

from config.settings import settings


def setup_logger():
    """全局日志配置。

    根据 settings 配置控制台与文件日志 handler，
    已初始化时自动跳过，避免重复配置。
    """
    # 先无条件压制噪音 logger，避免被 uvicorn 等的 root INFO 配置覆盖。
    # 注意：uvicorn 启动时先用 LOGGING_CONFIG 给 root 配 handler 并设为 INFO，
    # 随后 app import 触发本函数；若沿用下方的早退逻辑会直接 return，
    # 导致下面的 setLevel 被跳过，SQL 日志便从 root 继承 INFO 疯狂打印。
    _sql_echo = getattr(settings, "SQL_ECHO", False)
    _sql_level = logging.INFO if _sql_echo else logging.WARNING
    # SQLAlchemy 打印每条 SQL 的 logger（echo=True 时），默认压到 WARNING
    logging.getLogger("sqlalchemy.engine").setLevel(_sql_level)
    logging.getLogger("sqlalchemy.engine.Engine").setLevel(_sql_level)
    logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.dialects").setLevel(logging.WARNING)
    logging.getLogger("uvicorn").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

    root_logger = logging.getLogger()
    if root_logger.handlers:
        return
    log_level = getattr(logging, settings.LOG_LEVEL, logging.INFO)
    log_date_format = settings.LOG_DATE_FORMAT
    log_format = settings.LOG_FORMAT
    log_file_path = settings.LOG_FILE_PATH

    root_logger.setLevel(log_level)

    formatter = logging.Formatter(log_format, datefmt=log_date_format)

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    if log_file_path:
        if not os.path.exists(log_file_path):
            os.makedirs(os.path.dirname(log_file_path), exist_ok=True)
        file_handler = RotatingFileHandler(
            log_file_path,
            maxBytes=1024 * 1024 * 10,
            backupCount=5,  # 保留5个备份日志文件
            encoding='utf-8'
        )
        file_handler.setLevel(log_level)
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)


setup_logger()


def get_logger(name: str = __name__) -> logging.Logger:
    """获取日志器，传入 __name__ 即可。

    Args:
        name: 日志器名称。

    Returns:
        logging.Logger 实例。
    """
    return logging.getLogger(name)
