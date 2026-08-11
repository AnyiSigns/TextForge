from .tools.book_tools import (
    _build_book_tools,
    _extract_entities_from_text,
    _trunc,
)
from .tools.chapter_tools import (
    _append_chapter_content_version,
    _apply_unified_diff,
    _build_chapter_tools,
)
from .tools.lookup_tools import _build_lookup_tools, _normalize_status
from .tools.world_tools import _build_world_tools

__all__ = [
    "_append_chapter_content_version",
    "_apply_unified_diff",
    "_build_agent_tools",
    "_build_book_tools",
    "_build_chapter_tools",
    "_build_lookup_tools",
    "_build_world_tools",
    "_extract_entities_from_text",
    "_normalize_status",
    "_trunc",
    "build_tools",
]


def _build_agent_tools(session_factory, model_config: dict | None = None):
    """构建书籍上下文/世界/章节/记忆类工具（不含子包已独立的工作流桥、大纲扩展等工具）。"""
    tools = _build_lookup_tools(session_factory)
    tools += _build_world_tools(session_factory, model_config=model_config)
    tools += _build_book_tools(session_factory, model_config=model_config)
    tools += _build_chapter_tools(session_factory)
    return tools


def build_tools(session_factory, model_config: dict | None = None) -> list:
    """构建并返回全部 Agent 工具列表（供 bind_tools 与 ToolNode 共用）。

    Args:
        session_factory: 数据库会话工厂。
        model_config: 模型配置。

    Returns:
        工具实例列表。
    """
    from .tools.extend_outline_tool import build_extend_outline_tool
    from .tools.feedback_tools import _build_feedback_tools
    from .tools.generate_chapter_tool import build_generate_chapter_tool
    from .tools.workflow_bridge_tools import build_workflow_bridge_tools

    tools = _build_agent_tools(session_factory, model_config=model_config)
    tools.append(build_generate_chapter_tool(session_factory, model_config=model_config))
    tools.extend(build_workflow_bridge_tools(session_factory, model_config=model_config))
    tools.append(build_extend_outline_tool(session_factory, model_config=model_config))
    tools.extend(_build_feedback_tools(session_factory, model_config=model_config).values())
    return tools
