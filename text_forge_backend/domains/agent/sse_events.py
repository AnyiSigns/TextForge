import json


def _sse_review_card(pending_review: dict) -> str:
    """构造 review_card SSE 事件，output_preview 截断防止撑爆 SSE 通道。

    - 写章节卡（node_id=write_chapter_content）放宽到 8000 字（1.4：正文预览需可读）；
    - 其余卡片保持 1000 字（工作流审计卡等，过长无益）。

    Args:
        pending_review: state 中的 pending_review 字典。

    Returns:
        SSE data 行字符串。
    """
    payload = dict(pending_review)
    preview = payload.get("output_preview") or ""
    limit = 8000 if payload.get("node_id") == "write_chapter_content" else 1000
    if isinstance(preview, str) and len(preview) > limit:
        payload["output_preview"] = preview[:limit] + "\n…（已截断）"
    return f"data: {json.dumps({'type': 'review_card', **payload}, ensure_ascii=False)}\n\n"


async def _empty_sse(message: str):
    yield f"data: {json.dumps({'type': 'error', 'message': message}, ensure_ascii=False)}\n\n"
    yield f"data: {json.dumps({'type': 'end', 'reply': ''}, ensure_ascii=False)}\n\n"


def _sse_headers() -> dict:
    """SSE 响应通用头（no-cache + 禁用代理缓冲，供各流式端点复用）。"""
    return {
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }


def _sse_compress_done(summary: str, removed_count: int, remaining_count: int) -> str:
    """构造 compress_done SSE data 行（manual_compress 空/成功结果统一出口）。"""
    return f"data: {json.dumps({'type': 'compress_done', 'summary': summary, 'removed_count': removed_count, 'remaining_count': remaining_count}, ensure_ascii=False)}\n\n"


async def _single_sse(data_line: str):
    """把单条 SSE data 行包装为异步生成器（手动压缩的短路径统一用）。"""
    yield data_line
