import json
from typing import Annotated

from config.logging import get_logger
from core.auth import get_current
from core.security import verify_token
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect

from domains.agent.card_session import CARD_TYPES, card_session_manager

logger = get_logger(__name__)

router = APIRouter(prefix="/cards", tags=["Cards"])


@router.post("/open")
async def open_card(
    user_id: Annotated[int, Depends(get_current)],
    body: dict,
):
    book_id = body.get("book_id", 0)
    card_type = body.get("card_type", "custom")
    title = body.get("title", CARD_TYPES.get(card_type, "创意卡片"))
    model_config = body.get("model_config", {})

    if card_type not in CARD_TYPES:
        raise HTTPException(status_code=400, detail=f"无效的卡片类型: {card_type}")

    session, error = card_session_manager.open(
        user_id=user_id,
        book_id=book_id,
        card_type=card_type,
        title=title,
        model_config=model_config,
    )
    if error:
        raise HTTPException(status_code=429, detail=error)
    if not session:
        raise HTTPException(status_code=500, detail="创建卡片会话失败")

    return {
        "card_id": session.card_id,
        "card_type": session.card_type,
        "title": session.title,
        "ws_endpoint": f"/api/cards/{session.card_id}",
    }


@router.delete("/{card_id}")
async def close_card(
    card_id: str,
    user_id: Annotated[int, Depends(get_current)],
):
    session = card_session_manager.get(card_id)
    if not session or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="卡片会话不存在")
    card_session_manager.close(card_id)
    return {"status": "ok", "card_id": card_id}


@router.post("/confirm")
async def confirm_card(
    user_id: Annotated[int, Depends(get_current)],
    body: dict,
):
    card_id = body.get("card_id", "")
    if not card_id:
        raise HTTPException(status_code=400, detail="缺少 card_id")

    session = card_session_manager.get(card_id)
    if not session or session.user_id != user_id:
        raise HTTPException(status_code=404, detail="卡片会话不存在")

    result = card_session_manager.confirm(card_id)
    if not result:
        raise HTTPException(status_code=500, detail="确认卡片失败")

    return {"success": True, "card_result": result}


@router.websocket("/{card_id}")
async def card_websocket(
    websocket: WebSocket,
    card_id: str,
):
    session = card_session_manager.get(card_id)
    if not session:
        await websocket.close(code=4004, reason="卡片会话不存在或已过期")
        return

    auth_header = websocket.headers.get("authorization", "")
    if auth_header.startswith("Bearer "):
        token = auth_header[len("Bearer "):]
        payload = verify_token(token)
        if payload:
            token_user_id = payload.get("sub")
            if token_user_id and int(token_user_id) == session.user_id:
                pass
            else:
                await websocket.close(code=4003, reason="无权访问此卡片")
                return
        else:
            await websocket.close(code=4003, reason="无效的访问令牌")
            return
    else:
        await websocket.close(code=4003, reason="缺少访问令牌")
        return

    await websocket.accept()

    try:
        await websocket.send_text(json.dumps({
            "type": "connected",
            "card_id": card_id,
            "title": session.title,
        }, ensure_ascii=False))

        while True:
            data = await websocket.receive_text()
            try:
                msg = json.loads(data)
                msg_type = msg.get("type", "chat")
            except json.JSONDecodeError:
                await websocket.send_text(json.dumps({"type": "error", "message": "无效的 JSON 格式"}, ensure_ascii=False))
                continue

            if msg_type == "chat":
                user_message = msg.get("message", "")
                if not user_message.strip():
                    continue
                try:
                    async for token in session.chat_stream(
                        user_message,
                    ):
                        await websocket.send_text(json.dumps({
                            "type": "stream_token",
                            "token": token,
                        }, ensure_ascii=False))
                    await websocket.send_text(json.dumps({"type": "chat_done"}, ensure_ascii=False))
                except Exception as exc:
                    logger.exception("card chat 失败")
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": "对话处理失败",
                    }, ensure_ascii=False))

            elif msg_type == "simulate_dialogue":
                characters = msg.get("characters", [])
                setting = msg.get("setting", "自由对话")
                try:
                    dialogue = await session.simulate_dialogue(
                        characters, setting,
                    )
                    await websocket.send_text(json.dumps({
                        "type": "dialogue_result",
                        "content": dialogue,
                    }, ensure_ascii=False))
                except Exception as exc:
                    logger.exception("simulate_dialogue 失败")
                    await websocket.send_text(json.dumps({
                        "type": "error",
                        "message": "对话模拟失败",
                    }, ensure_ascii=False))

    except WebSocketDisconnect:
        logger.info(f"card WebSocket 断开: {card_id}")
    except Exception as exc:
        logger.exception(f"card WebSocket 异常: {card_id}")
