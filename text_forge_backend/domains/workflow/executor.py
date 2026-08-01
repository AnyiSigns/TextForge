import json
import time
from typing import AsyncGenerator
from domains.agent.state import ParentState
from domains.book.repository import (
    BookRepository,
)
from .repository import WorkflowRepository
from config.logging import get_logger
from sqlalchemy.ext.asyncio import AsyncSession
from collections import deque

logger = get_logger(__name__)


class WorkflowExecutor:
    """工作流执行器。

    负责加载工作流定义、拓扑排序、执行图并产出 SSE 事件流。
    """

    def __init__(self, session: AsyncSession):
        """初始化 WorkflowExecutor。

        Args:
            session: SQLAlchemy 异步会话。
        """
        self.session = session
        self.parent_graph = None

    async def _get_parent_graph(self):
        """懒加载 parent 图。"""
        if self.parent_graph is None:
            from domains.agent.graphs.registry import graph_register

            self.parent_graph = graph_register.get_compiled("parent")
        return self.parent_graph

    def _topological_store(self, nodes: list[dict], edges: list[dict]):
        """拓扑排序工作流节点。

        Args:
            nodes: 节点列表。
            edges: 边列表。

        Returns:
            排序后的节点列表。

        Raises:
            ValueError: 存在循环依赖时抛出。
        """
        in_degree = {n["id"]: 0 for n in nodes}
        graph = {n["id"]: [] for n in nodes}
        for e in edges:
            if e.get("from") in graph and e.get("to") in graph:
                graph[e["from"]].append(e["to"])
                in_degree[e["to"]] += 1
        queue = deque([nid for nid, deg in in_degree.items() if deg == 0])
        sorted_nodes = []
        while queue:
            nid = queue.popleft()
            sorted_nodes.append(next(n for n in nodes if n["id"] == nid))
            for neighbor in graph[nid]:
                in_degree[neighbor] -= 1
                if in_degree[neighbor] == 0:
                    queue.append(neighbor)
        if len(sorted_nodes) != len(nodes):
            raise ValueError("工作流存在循环依赖")
        return sorted_nodes

    def _count_words(self, text: str) -> int:
        """统计文本词数。

        Args:
            text: 输入文本。

        Returns:
            词数。
        """
        if not text:
            return 0
        try:
            import re
            return len(re.findall(r"\S+", text))
        except Exception:
            return len(text)

    async def run(
        self, workflow_id: str, user_id: int, book_id: int, thread_id: str, model_config: dict
    ) -> AsyncGenerator[str, None]:
        """执行工作流并产出 SSE 事件流。

        Args:
            workflow_id: 工作流 ID。
            user_id: 用户 ID。
            book_id: 书籍 ID。
            thread_id: 线程 ID。

        Yields:
            SSE 事件字符串。
        """
        workflow_repo = WorkflowRepository(self.session)
        workflow = await workflow_repo.get_workflow_id(workflow_id, user_id)
        if not workflow:
            raise ValueError("流水线不存在")
        book_repo = BookRepository(self.session)
        book = await book_repo.get(book_id)
        if not book or book.user_id != user_id:
            raise ValueError("书籍不存在")
        nodes = workflow.nodes or []
        edges = workflow.edges or []

        sorted_nodes = self._topological_store(nodes, edges)
        total_nodes = len(sorted_nodes)

        context_data = {}

        initial_state: ParentState = {
            "book_id": book_id,
            "user_id": user_id,
            "model_config": model_config,
            "workflow_nodes": nodes,
            "step_outputs": {},
            "executed_steps": [],
            "metadata": {},
            "next_step_id": None,
            "edges": edges,
            "book_title": book.title or "",
            "book_description": book.description or "",
            "book_genre": book.genre or "",
            **context_data,
        }
        config = {"configurable": {"thread_id": thread_id}}
        parent_graph = await self._get_parent_graph()
        current_display_id = None
        current_display_label = None
        executed_count = 0
        total_words = 0
        start_time = time.monotonic()
        try:
            outputs_map: dict = {}
            async for event in parent_graph.astream_events(
                initial_state, config=config, version="v2"
            ):
                kind = event.get("event")
                name = event.get("name")
                data = event.get("data", {})

                if kind == "on_chain_start" and name in (
                    "call_main",
                    "call_tool",
                    "call_audit",
                    "call_compression",
                ):
                    input_data = data.get("input", {}) or {}
                    exec_meta = input_data.get("_exec_meta") or {}
                    metadata = input_data.get("metadata", {})
                    if not exec_meta:
                        exec_meta = {
                            "node_id": metadata.get("current_node_id", name),
                            "node_label": metadata.get("current_node_label", name),
                        }
                    current_display_label = exec_meta.get("node_label", name)
                    current_display_id = exec_meta.get("node_id", name)

                    n = executed_count + 1
                    eta = 0.0
                    if executed_count > 0:
                        elapsed = time.monotonic() - start_time
                        eta = (elapsed / executed_count) * (total_nodes - executed_count)
                    progress_payload = {
                        "step": current_display_label,
                        "n": n,
                        "total": total_nodes,
                        "words": total_words,
                        "eta": round(eta, 2),
                    }
                    yield f"event:progress\ndata:{json.dumps(progress_payload)}\n\n"
                    yield f"event:node_start\ndata:{json.dumps({'node': current_display_label, 'node_id': current_display_id})}\n\n"
                    continue

                if kind == "on_chat_model_stream" and current_display_id is not None:
                    raw_chunk = data.get("chunk")
                    chunk = ""
                    if isinstance(raw_chunk, dict):
                        candidate = (
                            raw_chunk.get("content")
                            or raw_chunk.get("text")
                            or raw_chunk.get("delta")
                            or ""
                        )
                        chunk = (
                            candidate if isinstance(candidate, str) else str(candidate)
                        )
                    elif isinstance(raw_chunk, str):
                        chunk = raw_chunk
                    else:
                        chunk = getattr(raw_chunk, "content", "") or ""
                    chunk = chunk.strip()
                    if chunk:
                        payload = {
                            "output": chunk,
                            "node_id": current_display_id,
                            "node": current_display_label,
                        }
                        yield f"event:node_stream\ndata:{json.dumps(payload)}\n\n"
                    continue

                if kind == "on_chain_stream" and name in (
                    "call_main",
                    "call_tool",
                    "call_audit",
                    "call_compression",
                ):
                    raw_chunk = data.get("chunk")
                    chunk = ""
                    if isinstance(raw_chunk, dict):
                        candidate = (
                            raw_chunk.get("content")
                            or raw_chunk.get("text")
                            or raw_chunk.get("delta")
                            or raw_chunk.get("output")
                            or ""
                        )
                        chunk = (
                            candidate if isinstance(candidate, str) else str(candidate)
                        )
                    elif isinstance(raw_chunk, str):
                        chunk = raw_chunk
                    elif raw_chunk is not None:
                        chunk = getattr(raw_chunk, "content", None) or ""
                    chunk = chunk.strip()
                    if chunk and current_display_id is not None:
                        payload = {
                            "output": chunk,
                            "node_id": current_display_id,
                            "node": current_display_label or name,
                        }
                        yield f"event:node_stream\ndata:{json.dumps(payload)}\n\n"
                    continue

                if (
                    kind == "on_custom"
                    and isinstance(data.get("chunk"), str)
                    and current_display_id is not None
                ):
                    chunk = data["chunk"].strip()
                    if chunk:
                        payload = {
                            "output": chunk,
                            "node_id": current_display_id,
                            "node": current_display_label or name,
                        }
                        yield f"event:node_stream\ndata:{json.dumps(payload)}\n\n"
                    continue

                if kind == "on_chain_end" and name in (
                    "call_main",
                    "call_tool",
                    "call_audit",
                    "call_compression",
                ):
                    input_data = data.get("input", {}) or {}
                    exec_meta = input_data.get("_exec_meta") or {}
                    metadata = input_data.get("metadata", {})
                    if not exec_meta:
                        exec_meta = {
                            "node_id": metadata.get("current_node_id", name),
                            "node_label": metadata.get("current_node_label", name),
                        }
                    display_label = exec_meta.get("node_label", name)
                    display_id = exec_meta.get("node_id", name)

                    output_data = data.get("output", {})
                    step_outputs = output_data.get("step_outputs", {}) or {}
                    node_output = step_outputs.get(display_id, "") or output_data.get(
                        "output", ""
                    )
                    if not isinstance(node_output, str):
                        node_output = json.dumps(node_output, ensure_ascii=False)
                    outputs_map.update(step_outputs)
                    total_words += self._count_words(str(node_output))
                    executed_count += 1
                    n = executed_count
                    eta = 0.0
                    if executed_count > 0:
                        elapsed = time.monotonic() - start_time
                        eta = (elapsed / executed_count) * (total_nodes - executed_count)
                    progress_payload = {
                        "step": display_label,
                        "n": n,
                        "total": total_nodes,
                        "words": total_words,
                        "eta": round(eta, 2),
                    }
                    yield f"event:progress\ndata:{json.dumps(progress_payload)}\n\n"
                    yield f"event:node_end\ndata:{json.dumps({'node': display_label, 'node_id': display_id, 'output': node_output})}\n\n"
                    current_display_id = None
                    current_display_label = None
                    continue

                if kind == "on_stream_end":
                    final_output = data.get("final_output", {}) or {}
                    executed = final_output.get("executed_steps", [])
                    step_outputs = final_output.get("step_outputs", outputs_map)
                    steps_payload = []
                    for sid in executed:
                        steps_payload.append(
                            {
                                "nodeId": sid,
                                "label": sid,
                                "output": step_outputs.get(sid, ""),
                                "status": "done",
                            }
                        )
                    logger.info(f"[stream] done steps={len(steps_payload)}")
                    yield f"event:done\ndata:{json.dumps({'steps': steps_payload, 'output': final_output})}\n\n"
                    continue
        except Exception as e:
            logger.error("工作流异常", exc_info=True)
            yield f"event:error\ndata:{json.dumps({'error': '工作流执行异常'})}\n\n"
            return
