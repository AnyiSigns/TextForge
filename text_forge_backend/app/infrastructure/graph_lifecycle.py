from app.agents.graphs.chat_graph import chat_graph
from app.agents.graphs.registry import graph_register



graph_register.register_builder("chat",chat_graph)


async def compiled_all(checkpointer):
    """编译所有图"""
    for name,builder in graph_register._builders.items():
        raw_graph=builder
        compiled_graph=raw_graph.compile(checkpointer=checkpointer)
        graph_register.register_compiled(name,compiled_graph)
        print(f"已编译图{name}")


