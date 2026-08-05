"""世界观状态词表与归一化工具。

伏笔（Foreshadowing）与情节线（PlotThread）的状态在写入侧统一为英文枚举，
读取侧通过别名表兼容前端可能写入的中文旧值（如「进行中」「已埋下」）。
"""

FORESHADOWING_STATUSES = ("planted", "resolved", "abandoned")
PLOT_THREAD_STATUSES = ("active", "completed", "paused", "abandoned")

STATUS_ALIASES = {
    "埋下": "planted",
    "已埋下": "planted",
    "已回收": "resolved",
    "已放弃": "abandoned",
    "进行中": "active",
    "已完成": "completed",
    "已暂停": "paused",
    "已中断": "abandoned",
}


def normalize_foreshadowing_status(value) -> str | None:
    """伏笔状态归一化：命中别名返回英文，否则原样小写返回。

    Args:
        value: 待归一化的状态值，可为中文或英文。

    Returns:
        归一化后的英文状态；空值原样返回。
    """
    if not value:
        return value
    return STATUS_ALIASES.get(value, value)


def normalize_plot_thread_status(value) -> str | None:
    """情节线状态归一化：命中别名返回英文，否则原样小写返回。

    Args:
        value: 待归一化的状态值，可为中文或英文。

    Returns:
        归一化后的英文状态；空值原样返回。
    """
    if not value:
        return value
    return STATUS_ALIASES.get(value, value)
