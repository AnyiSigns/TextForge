import logging
import os
import sys
from logging.handlers import RotatingFileHandler
from config.settings import settings

def setup_logger():
    """全局日志配置"""
    log_level=getattr(logging,settings.LOG_LEVEL,logging.INFO)
    log_date_format=settings.LOG_DATE_FORMAT
    log_format=settings.LOG_FORMAT
    log_file_path=settings.LOG_FILE_PATH

    # 配置根日志记录器
    root_logger=logging.getLogger()
    root_logger.setLevel(log_level)

    # 如果根日志记录器已存在处理程序，则清除它们
    if root_logger.handlers:
        root_logger.handlers.clear()

    #创建格式化器
    formatter=logging.Formatter(log_format,datefmt=log_date_format)

    console_handler = logging.StreamHandler(sys.stdout)  # sys.stdout标准输出
    console_handler.setLevel(log_level)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)  # 将控制台处理器添加到根日志器

    # 创建文件处理器,RotatingFileHandler(旋转文件处理器),1024*1024*10,10M,5个备份
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
        root_logger.addHandler(file_handler)  # 将文件处理器添加到根日志器

    # 降噪
    logging.getLogger("uvicorn").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

setup_logger()

def get_logger(name: str = __name__) -> logging.Logger:
    """
    获取日志器,传入__name__即可
    :param name: 日志器名称
    :return:日志器
    """
    return logging.getLogger(name)