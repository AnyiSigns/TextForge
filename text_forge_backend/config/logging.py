import contextvars
import json
import logging
import os
import sys
from logging.handlers import RotatingFileHandler

from config.settings import settings

# 请求 ID 上下文变量，供 JSON 日志携带链路标识（由中间件在每次请求注入）
request_id_var = contextvars.ContextVar("request_id", default="-")


class JsonFormatter(logging.Formatter):
    """结构化 JSON 日志格式器，附带 request_id 便于跨服务链路追踪。"""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict = {
            "ts": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
            "request_id": request_id_var.get(),
        }
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def _make_formatter() -> logging.Formatter:
    if getattr(settings, "LOG_JSON", False):
        return JsonFormatter()
    return logging.Formatter(settings.LOG_FORMAT, datefmt=settings.LOG_DATE_FORMAT)


def setup_logger():
    """全局日志配置。

    根据 settings 配置控制台与文件日志 handler。统一清掉已有 handler（含 uvicorn
    启动时注入的默认 handler）后按 LOG_JSON 重新挂载，避免 JSON 格式不生效或重复日志。
    """
    # 先无条件压制噪音 logger
    _sql_echo = getattr(settings, "SQL_ECHO", False)
    _sql_level = logging.INFO if _sql_echo else logging.WARNING
    logging.getLogger("sqlalchemy.engine").setLevel(_sql_level)
    logging.getLogger("sqlalchemy.engine.Engine").setLevel(_sql_level)
    logging.getLogger("sqlalchemy.pool").setLevel(logging.WARNING)
    logging.getLogger("sqlalchemy.dialects").setLevel(logging.WARNING)
    logging.getLogger("uvicorn").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

    root_logger = logging.getLogger()
    # 清掉已有 handler，确保 JSON 格式生效且不重复
    for handler in list(root_logger.handlers):
        root_logger.removeHandler(handler)
        try:
            handler.close()
        except Exception:
            pass

    log_level = getattr(logging, settings.LOG_LEVEL, logging.INFO)
    root_logger.setLevel(log_level)
    root_logger.propagate = False

    formatter = _make_formatter()

    console_handler = logging.StreamHandler(sys.stdout)
    console_handler.setLevel(log_level)
    console_handler.setFormatter(formatter)
    root_logger.addHandler(console_handler)

    if settings.LOG_FILE_PATH:
        try:
            log_dir = os.path.dirname(settings.LOG_FILE_PATH)
            if log_dir:
                os.makedirs(log_dir, exist_ok=True)
            file_handler = RotatingFileHandler(
                settings.LOG_FILE_PATH,
                maxBytes=1024 * 1024 * 10,
                backupCount=5,
                encoding="utf-8",
            )
            file_handler.setLevel(log_level)
            file_handler.setFormatter(formatter)
            root_logger.addHandler(file_handler)
        except Exception as exc:
            sys.stderr.write(f"日志文件初始化失败: {exc}\n")


setup_logger()


def get_logger(name: str = __name__) -> logging.Logger:
    """获取日志器，传入 __name__ 即可。"""
    return logging.getLogger(name)
