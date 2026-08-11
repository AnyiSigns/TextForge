"""workflow_scheduler 拆分为 workflow_context + workflow_execute 后的薄聚合层。

保留旧导入路径（workflow 域 router / workflow_runner_node / 测试均从本模块导入）：
    - run_workflow / execute_node / audit_node_output / topological_sort / WorkflowCycleError
    - auto_allocate_context / CONTEXT_FIELD_MAP / KEYWORD_CONTEXT_MAP
"""

from .workflow_context import (
    CONTEXT_FIELD_MAP,
    KEYWORD_CONTEXT_MAP,
    _build_chapter_target_context,
    _format_context_field,
    _format_prompt_context,
    _load_context_pool,
    _query_structured_context,
    auto_allocate_context,
)
from .workflow_execute import (
    WorkflowCycleError,
    audit_node_output,
    execute_node,
    run_workflow,
    topological_sort,
)

__all__ = [
    "CONTEXT_FIELD_MAP",
    "KEYWORD_CONTEXT_MAP",
    "WorkflowCycleError",
    "_build_chapter_target_context",
    "_format_context_field",
    "_format_prompt_context",
    "_load_context_pool",
    "_query_structured_context",
    "audit_node_output",
    "auto_allocate_context",
    "execute_node",
    "run_workflow",
    "topological_sort",
]
