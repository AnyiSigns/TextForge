def merge_dicts(base: dict, overlay: dict) -> dict:
    result = base.copy()
    result.update(overlay)
    return result


def truncate_text(text: str, max_chars: int = 8000) -> str:
    if len(text) <= max_chars:
        return text
    return text[: max_chars // 2] + "\n...[截断]...\n" + text[-max_chars // 2 :]


# 用户可见异常文本中需脱敏的敏感键（模型/搜索 provider 异常可能携带 base_url、
# api_key、账号标识等内部信息，直接回显会泄漏内部参数）。
_SENSITIVE_KEYS = (
    "api_key",
    "apikey",
    "api-key",
    "authorization",
    "bearer",
    "password",
    "token",
    "secret",
)


def redact_sensitive(text: str) -> str:
    """把异常/错误文本中的敏感键值替换为占位符，避免内部参数泄漏给用户。

    覆盖常见形态：`api_key=sk-xxx`、`"api_key": "xxx"`、`Bearer xxx`、
    `Authorization: Bearer xxx` 等。值部分允许空格/引号/标点（含 JWT 三类字符
    与连字符），匹配到行尾或「;」/「,」/空格+后续键 为止；仅做文本级脱敏，
    不解析 JSON 结构。
    """
    if not text:
        return text
    import re

    result = text
    # 键值对形态：key=value / key: value / "key": "value" / key = value
    # 值允许引号包裹、Bearer 前缀、URL 安全字符与常见 token 标点。
    for key in _SENSITIVE_KEYS:
        result = re.sub(
            rf"({re.escape(key)}\s*[=:]\s*[\"']?)(?:Bearer\s+)?[A-Za-z0-9_\-./:+=?&%#@~$]+",
            r"\1***",
            result,
            flags=re.IGNORECASE,
        )
    # 独立 Bearer token 形态（无 key= 前缀，如异常消息里的 "Bearer abc.def"）
    result = re.sub(
        r"(Bearer\s+)[A-Za-z0-9_\-./:=+?&%]+",
        r"\1***",
        result,
        flags=re.IGNORECASE,
    )
    return result
