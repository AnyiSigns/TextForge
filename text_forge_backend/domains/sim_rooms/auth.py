"""SimRoom WebSocket 鉴权：token 解析（subprotocol 优先）+ JWT 校验 + 房间归属校验。"""
from core.security import verify_token
from fastapi import WebSocket


async def ws_authenticate(websocket: WebSocket, room) -> int | None:
    """从 WebSocket 握手解析并校验 JWT，返回用户 ID；失败时关闭连接并返回 None。

    认证凭证优先从 Sec-WebSocket-Protocol（subprotocol）读取：浏览器 WebSocket
    无法自定义请求头，token 放 query 会进入访问日志/代理日志（敏感泄露）；
    JWT 为 base64url 字符集，合法作为 subprotocol 值。

    Args:
        websocket: 客户端 WebSocket。
        room: SimRoom 实例（用于归属校验）。

    Returns:
        校验通过返回用户 ID；任何失败均已关闭连接，返回 None。
    """
    token = None
    sec_protocol = websocket.headers.get("sec-websocket-protocol", "")
    if sec_protocol:
        token = sec_protocol.split(",")[0].strip()
    if not token:
        auth_header = websocket.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[len("Bearer "):]

    if not token:
        await websocket.close(code=4003, reason="缺少认证")
        return None

    payload = verify_token(token)
    if not payload:
        await websocket.close(code=4003)
        return None
    token_user_id = int(payload.get("sub", 0))
    if token_user_id != room.user_id:
        await websocket.close(code=4003)
        return None
    return token_user_id
