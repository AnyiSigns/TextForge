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
            backupCount=5,
            encoding='utf-8'
        )
        file_handler.setLevel(log_level)
        file_handler.setFormatter(formatter)
        root_logger.addHandler(file_handler)

    logging.getLogger("uvicorn").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)


setup_logger()


def get_logger(name: str = __name__) -> logging.Logger:
    """获取日志器，传入 __name__ 即可。

    Args:
        name: 日志器名称。

    Returns:
        logging.Logger 实例。
    """
    return logging.getLogger(name)
