import logging

from fastapi import Depends, HTTPException

from core.auth import get_current

logger = logging.getLogger(__name__)

# 单用户请求速率上限（固定窗口计数 / 窗口秒数）。
# 单 worker 下防止某用户开大量并发流/导出占满事件循环、拖垮其他人。
RATE_LIMITS: dict[str, tuple[int, int]] = {
    "agent_stream": (5, 60),
    "agent_compress": (5, 60),
    "agent_review_action": (30, 60),
    "agent_start": (10, 60),
    "export": (5, 60),
}


async def _check_rate_limit(key: str, limit: int, window: int) -> None:
    """按 key 做固定窗口计数限流，超限抛 429；Redis 不可用时降级放行。"""
    try:
        from shared.redis import redis_client

        pipe = redis_client.pipeline()
        pipe.incr(key)
        # 仅首次创建键时设置过期（nx=True），避免每次请求都重置窗口导致限流失效
        pipe.expire(key, window, nx=True)
        results = await pipe.execute()
        count = int(results[0])
        if count > limit:
            logger.warning(f"限流触发: {key} count={count} limit={limit}")
            raise HTTPException(status_code=429, detail="请求过于频繁，请稍后再试")
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning(f"限流检查失败（放行）: {exc}")


async def rate_limit_agent(user_id: int = Depends(get_current)):
    """Agent 流式接口单用户限流依赖。"""
    limit, window = RATE_LIMITS["agent_stream"]
    await _check_rate_limit(f"ratelimit:agent_stream:{user_id}", limit, window)


async def rate_limit_compress(user_id: int = Depends(get_current)):
    """Agent 手动压缩接口单用户限流依赖（P-D）。"""
    limit, window = RATE_LIMITS["agent_compress"]
    await _check_rate_limit(f"ratelimit:agent_compress:{user_id}", limit, window)


async def rate_limit_review_action(user_id: int = Depends(get_current)):
    """Agent 审核卡决策接口单用户限流依赖（P-D）。"""
    limit, window = RATE_LIMITS["agent_review_action"]
    await _check_rate_limit(f"ratelimit:agent_review_action:{user_id}", limit, window)


async def rate_limit_start(user_id: int = Depends(get_current)):
    """Agent 会话创建接口单用户限流依赖（P-D）。"""
    limit, window = RATE_LIMITS["agent_start"]
    await _check_rate_limit(f"ratelimit:agent_start:{user_id}", limit, window)


async def rate_limit_export(user_id: int = Depends(get_current)):
    """书籍导出接口单用户限流依赖。"""
    limit, window = RATE_LIMITS["export"]
    await _check_rate_limit(f"ratelimit:export:{user_id}", limit, window)
