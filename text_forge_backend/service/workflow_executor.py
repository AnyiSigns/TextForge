import json
from typing import AsyncGenerator
from infrastructure.database import db_manager
from repository.model_repo import ModelConfRepository
from agents.state import ParentState
from repository.project_repo import (
    BookRepository,
)
from repository.workflow import WorkflowRepository
from repository.outline_repo import OutlineRepository
from repository.structured_repo import StructuredRepository
from utils.logger import get_logger
from sqlalchemy.ext.asyncio import AsyncSession
from collections import deque
from model.model import ModelConfig

logger = get_logger(__name__)


class WorkflowExecutor:
    def __init__(self, session: AsyncSession):
        self.session = session
        self.parent_graph = None

    async def _get_parent_graph(self):
        if self.parent_graph is None:
            from agents.graphs.registry import graph_register

            self.parent_graph = graph_register.get_compiled("parent")
        return self.parent_graph

    async def _get_user_model_config(self, user_id: int):
        repo = ModelConfRepository(self.session)
        instance = await repo.query_user_model(user_id)
        if not instance:
            instance = ModelConfig(user_id=user_id)
        return {
            "user_id": instance.user_id,
            "main_config": instance.main_config or {},
            "audit_config": instance.audit_config or {},
            "router_config": instance.router_config or {},
            "tool_config": instance.tool_config or {},
            "vision_config": instance.vision_config or {},
            "embedding_config": instance.embedding_config or {},
        }

    async def _load_context(self, book_id: int) -> dict:
        """一次性加载项目上下文到扁平字段"""
        async with db_manager.with_db() as session:
            repo = StructuredRepository(session)
            # 这里暂时返回空字符串，实际可根据需求查询具体字段
            # 也可以在此集成 Book/CreativeSetting/Outline/Characters 的组装
            return {
                "input_summary": "",
                "input_worldview": "",
                "input_brief_summary": "",
                "input_characters": "",
                "input_recent_chapters": "",
                "input_outline": "",
            }

    def _topological_store(self, nodes: list[dict], edges: list[dict]):
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

    async def run(
        self, workflow_id: str, user_id: int, book_id: int, thread_id: str
    ) -> AsyncGenerator[str, None]:
        workflow_repo = WorkflowRepository(self.session)
        workflow = await workflow_repo.get_workflow_id(workflow_id, user_id)
        if not workflow:
            raise ValueError("流水线不存在")
        book_repo = BookRepository(self.session)
        book = await book_repo.get(book_id)
        if not book or book.user_id != user_id:
            raise ValueError("书籍不存在")
        model_config = await self._get_user_model_config(user_id)
        nodes = workflow.nodes or []

        # 一次性加载上下文
        context_data = await self._load_context(book_id)

        initial_state: ParentState = {
            "book_id": book_id,
            "user_id": user_id,
            "model_config": model_config,
            "workflow_nodes": nodes,
            "step_outputs": {},
            "executed_steps": [],
            "metadata": {},
            "next_step_id": None,
            "edges": workflow.edges or [],
            "book_title": book.title or "",
            "book_description": book.description or "",
            "book_genre": book.genre or "",
            **context_data,
        }
        config = {"configurable": {"thread_id": thread_id}}
        parent_graph = await self._get_parent_graph()
        current_display_id = None
        current_display_label = None
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
                    logger.info(
                        f"[stream] end {display_label}, output={str(node_output)[:80]}"
                    )
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
            yield f"event:error\ndata:{json.dumps({'error': str(e)})}\n\n"
            return

    async def _auto_summarize(self, session, book_id, outputs_map):
        outlines = await OutlineRepository(session).list_outlines(book_id=book_id)
        if not outlines:
            return
        content = outlines[0].content or "[]"
        try:
            volumes = json.loads(content) if isinstance(content, str) else content
        except Exception:
            volumes = []
        if not isinstance(volumes, list):
            volumes = []
        all_chapters = [
            ch
            for vol in volumes
            if isinstance(vol, dict)
            for ch in (vol.get("chapters") or [])
        ]
        target = next(
            (
                ch
                for ch in all_chapters
                if ch.get("summary") is None and ch.get("content")
            ),
            None,
        )
        if not target:
            return
        first_output = next((str(v) for v in outputs_map.values() if v), "")
        if not first_output:
            return
        try:
            model_config = await self._get_user_model_config(outlines[0].book_id)
            llm = ModelFactory(model_config)
            prompt = (
                "请用2-3句话概括以下章节内容，保留关键情节和核心信息，语言简洁。\n\n章节标题："
                + str(target.get("title", ""))
                + "\n正文:"
                + first_output
            )
            messages = [SystemMessage("你是章节摘要助手"), HumanMessage(prompt)]
            res = await llm.main.ainvoke(messages)
            target["summary"] = res.content.strip()
            await OutlineRepository(session).update_outline(
                outlines[0].id, data=volumes
            )
        except Exception:
            pass
