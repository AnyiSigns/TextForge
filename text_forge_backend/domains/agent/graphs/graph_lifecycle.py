from domains.agent.graphs.chat_graph import (
    main_graph,
    router_graph,
    audit_graph,
    tool_graph,
    parent_graph,
    compression_graph,
)
from domains.agent.graphs.registry import graph_register
from config.logging import get_logger

logger = get_logger(__name__)

graph_register.register_builder("main_graph", main_graph)
graph_register.register_builder("router", router_graph)
graph_register.register_builder("audit_graph", audit_graph)
graph_register.register_builder("tool_graph", tool_graph)
graph_register.register_builder("parent", parent_graph)
graph_register.register_builder("compression_graph", compression_graph)


async def compiled_all(checkpointer):
    """编译所有图"""
    for name, builder in graph_register.get_all_builders().items():
        raw_graph = builder
        compiled_graph = raw_graph.compile(checkpointer=checkpointer)
        graph_register.register_compiled(name, compiled_graph)
        logger.info(f"已编译图{name}")
