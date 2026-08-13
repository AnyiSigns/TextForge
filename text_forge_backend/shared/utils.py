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
    "base_url",
    "baseurl",
    "endpoint",
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
    # (?<![\w]) 词边界：避免 databaseurl/callbackurl 等长键命中的 "baseurl" 子串被误伤。
    for key in _SENSITIVE_KEYS:
        result = re.sub(
            rf"(?<![\w])({re.escape(key)}\s*[=:]\s*[\"']?)(?:Bearer\s+)?[A-Za-z0-9_\-./:+=?&%#@~$]+",
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


# 内网/保留域名后缀：容器与云环境常见的内部服务名，禁止作为外部模型服务地址
_INTERNAL_HOST_SUFFIXES = (".local", ".localhost", ".internal", ".intranet", ".cluster.local")
_INTERNAL_HOST_NAMES = ("localhost", "metadata", "metadata.google.internal")


def is_public_http_url(url: str) -> bool:
    """校验 URL 是否为「可对外访问的 http/https 地址」，用于阻断 SSRF。

    拒绝：非 http/https 协议、无主机名、环回/私有/链路本地/保留网段 IP
    （127.0.0.1、10.x、172.16-31.x、192.168.x、169.254.x、0.0.0.0、::1 等），
    以及 localhost / *.local / *.internal 等内部域名。

    仅做地址字面量校验，不做 DNS 解析，因此无法防御 DNS 重绑定；
    对正常云厂商域名（api.openai.com、dashscope.aliyuncs.com 等）一律放行。

    Args:
        url: 待校验的地址。

    Returns:
        是否允许访问该地址。
    """
    import ipaddress
    from urllib.parse import urlparse

    if not url or not isinstance(url, str):
        return False
    try:
        parsed = urlparse(url.strip())
    except ValueError:
        return False
    if parsed.scheme not in ("http", "https"):
        return False
    host = (parsed.hostname or "").strip().lower().rstrip(".")
    if not host:
        return False
    if host in _INTERNAL_HOST_NAMES or host.endswith(_INTERNAL_HOST_SUFFIXES):
        return False
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        # 普通域名：无法在此判定，放行（云厂商 base_url 主体场景）
        return True
    # IPv4-mapped IPv6（如 ::ffff:127.0.0.1）按其 IPv4 地址判定
    mapped = getattr(ip, "ipv4_mapped", None)
    if mapped is not None:
        ip = mapped
    return not (
        ip.is_private
        or ip.is_loopback
        or ip.is_link_local
        or ip.is_reserved
        or ip.is_multicast
        or ip.is_unspecified
    )

