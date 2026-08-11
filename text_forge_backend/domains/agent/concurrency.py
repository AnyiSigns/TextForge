import asyncio
import uuid

from config.logging import get_logger
from shared.redis import redis_client

logger = get_logger(__name__)

# 正在进行的流式请求 task 注册表（key=thread_id），供 cancel 接口主动中断。
# 注意：仅对当前进程内的流生效（本地/单进程部署），多 worker 下其他进程的
# 流无法被取消，但前端本地 abort 连接同样会触发服务端清理，属兜底机制。
_stream_tasks: dict[str, asyncio.Task] = {}

BOOK_LOCK_TTL = 600  # 锁过期时间，600秒（10分钟）；配合 _renew_book_lock 心跳续期，
# 既能覆盖长任务（工作流多节点可达数十分钟），又保证进程崩溃残留的锁至多占用 10 分钟。
BOOK_LOCK_RENEW_INTERVAL = 120  # 锁心跳续期间隔（秒）

# ── 2.9 P-A：同 thread 并发互斥 ──────────────────────────────────────
# 本地 _stream_tasks（进程内）+ Redis agent:thread_lock（跨进程）双保险：
# 同一 thread 同时只允许一个流式/压缩任务执行；占位注册用 try/except 管理，
# 所有出口（早退 return / 异常 / 生成器结束）都必须 pop，否则该 thread 永久 409。

THREAD_LOCK_TTL = 600


async def _acquire_book_lock(book_id: int, user_id: int) -> tuple[bool, str, str]:
    """为书籍获取分布式锁，返回 (是否获取成功, 锁键, 持有者标识)。

    锁键固定为 ``agent:book_lock:{user_id}:{book_id}``，值写入本次请求的
    持有者标识（holder_id），利用 SET NX 保证同一本书在同一时刻只有
    一个 Agent 会话能持有锁；释放时校验持有者，避免误删他人锁。
    """
    if not book_id:
        return (True, "", "")
    holder_id = uuid.uuid4().hex
    key = f"agent:book_lock:{user_id}:{book_id}"
    try:
        result = await redis_client.set(key, holder_id, ex=BOOK_LOCK_TTL, nx=True)
        return (result is True, key, holder_id)
    except Exception as exc:
        logger.error(f"获取书籍锁失败: {exc}")
        return (False, "", "")


async def _renew_book_lock(lock_key: str, holder_id: str) -> None:
    """后台心跳任务：周期性刷新书籍锁 TTL，防止长任务执行期间锁过期被他人获取。

    仅当锁值仍为本持有者时才续期（Lua 原子判断），锁已被释放或易主时结束任务。

    Args:
        lock_key: 锁键。
        holder_id: 锁持有者标识。
    """
    while True:
        await asyncio.sleep(BOOK_LOCK_RENEW_INTERVAL)
        try:
            script = (
                "if redis.call('GET', KEYS[1]) == ARGV[1] "
                "then return redis.call('EXPIRE', KEYS[1], ARGV[2]) else return 0 end"
            )
            await redis_client.eval(script, 1, lock_key, holder_id, BOOK_LOCK_TTL)
        except Exception as exc:
            logger.warning(f"续期书籍锁失败: {exc}")
            break


async def _release_book_lock(
    book_id: int,
    user_id: int,
    lock_key: str | None = None,
    holder_id: str | None = None,
):
    """释放先前获取的书籍分布式锁。

    仅当锁值仍为本请求持有的 holder_id 时才删除（Lua 原子判断），
    防止并发场景下误删另一会话重新获取的锁。
    """
    if not book_id or not lock_key:
        return
    try:
        if holder_id:
            script = (
                "if redis.call('GET', KEYS[1]) == ARGV[1] "
                "then return redis.call('DEL', KEYS[1]) else return 0 end"
            )
            await redis_client.eval(script, 1, lock_key, holder_id)
        else:
            # 兼容旧调用：无持有者信息时仅删除固定锁键（不再扫描模式删除，
            # 避免误删同书籍其他会话的锁）。
            await redis_client.delete(lock_key)
    except Exception as exc:
        logger.error(f"释放书籍锁失败: {exc}")


async def _acquire_thread_lock(thread_id: str) -> tuple[bool, str, str]:
    """为会话线程获取 Redis 互斥锁，返回 (是否获取成功, 锁键, 持有者标识)。"""
    holder_id = uuid.uuid4().hex
    key = f"agent:thread_lock:{thread_id}"
    try:
        result = await redis_client.set(key, holder_id, ex=THREAD_LOCK_TTL, nx=True)
        return (result is True, key, holder_id)
    except Exception as exc:
        logger.error(f"获取线程锁失败: {exc}")
        return (False, "", "")


async def _release_thread_lock(lock_key: str, holder_id: str) -> None:
    """释放线程锁（仅当锁值仍为本持有者，防误删他人锁）。"""
    if not lock_key:
        return
    try:
        script = (
            "if redis.call('GET', KEYS[1]) == ARGV[1] "
            "then return redis.call('DEL', KEYS[1]) else return 0 end"
        )
        await redis_client.eval(script, 1, lock_key, holder_id)
    except Exception as exc:
        logger.warning(f"释放线程锁失败: {exc}")
