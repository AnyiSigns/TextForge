import json
from typing import AsyncGenerator
from infrastructure.database import db_manager
from repository.model_repo import ModelConfRepository
from agents.state import ParentState
from repository.project_repo import (
    CreativeSettingRepository,
    CharacterRepository,
    BookRepository,
)
from repository.workflow_repo import WorkflowRepository
from repository.outline_repo import OutlineRepository
from utils.logger import get_logger
from sqlalchemy.ext.asyncio import AsyncSession
from collections import deque
from model.model import ModelConfig
from core.model_factory import ModelFactory
from langchain_core.messages import SystemMessage, HumanMessage

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

    def _topological_store(self, nodes: list[dict]):
        in_degree = {n["id"]: 0 for n in nodes}
        graph = {n["id"]: [] for n in nodes}
        for n in nodes:
            for dep in n.get("depends_on") or []:
                if dep in graph:
                    graph[dep].append(n["id"])
                    in_degree[n["id"]] += 1
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
        self, workflow_id: str, user_id: int, project_id: int, thread_id: str
    ) -> AsyncGenerator[str, None]:
        workflow_repo = WorkflowRepository(self.session)
        workflow = await workflow_repo.get_workflow_id(workflow_id, user_id)
        if not workflow:
            raise ValueError("流水线不存在")
        book_repo = BookRepository(self.session)
        book = await book_repo.get(project_id)
        if not book or book.user_id != user_id:
            raise ValueError("书籍不存在")
        parts = [f"#书名\n{book.title}"]
        if book.description:
            parts.append(f"#书籍描述\n{book.description}")
        if book.genre:
            parts.append(f"类型\n{book.genre}")

        setting_repo = CreativeSettingRepository(self.session)
        setting = await setting_repo.get_setting(project_id)
        worldview_text = ""
        if setting:
            worldview_text = f"# 世界观\n{setting.worldview or ''}\n# 文风/基调\n{setting.tone or ''}\n# 创作禁忌\n{setting.writing_taboos or ''}"
            parts.append(worldview_text)

        char_repo = CharacterRepository(self.session)
        characters = await char_repo.book_character_detail(user_id, project_id)
        char_text = ""
        if characters:
            char_lines = [f"-{c.name}:{c.description}" for c in characters]
            char_text = f"#角色设定\n" + "\n".join(char_lines)
            parts.append(char_text)

        outline_repo = OutlineRepository(self.session)
        outlines = await outline_repo.list_outlines(project_id)
        outline_text = ""
        recent_chapters_text = ""
        brief_summary_text = ""
        if outlines:
            raw = outlines[0].data
            volumes = raw if isinstance(raw, list) else raw.get("data", [])
            outline_lines = []
            for vol in volumes:
                outline_lines.append(f"## {vol.get('title', '')}")
                for ch in vol.get("chapters", []):
                    outline_lines.append(f"- {ch.get('title', '')}")
                    if ch.get("summary"):
                        brief_summary_text += f"- {ch['title']}：{ch['summary']}\n"
                    if ch.get("content"):
                        recent_chapters_text += (
                            f"\n# {ch['title']}\n{ch['content'][:3000]}"
                        )
            outline_text = "\n".join(outline_lines)

        input_text = "\n\n".join(parts)
        nodes = self._topological_store(workflow.nodes or [])  # type: ignore
        model_config = await self._get_user_model_config(user_id)

        inital_state: ParentState = {
            "input_summary": input_text,
            "input_worldview": worldview_text,
            "input_brief_summary": brief_summary_text,
            "input_characters": char_text,
            "input_recent_chapters": recent_chapters_text,
            "input_outline": outline_text,
            "workflow_nodes": nodes,
            "step_outputs": {},
            "executed_steps": [],
            "metadata": {},
            "next_step_id": None,
            "model_config": model_config,
        }
        config = {"configurable": {"thread_id": thread_id}}
        parent_graph = await self._get_parent_graph()
        try:
            outputs_map: dict = {}
            async for event in parent_graph.astream_events(
                inital_state, config=config, version="v2"  # type: ignore
            ):  # type: ignore
                kind = event.get("event")
                name = event.get("name")
                data = event.get("data", {})
                if kind == "on_chain_start" and name not in (
                    None,
                    "LangGraph",
                    "pregel",
                ):
                    logger.info(f"[SSE] chain_start -> {name}")
                    yield f"event:node_start\ndata:{json.dumps({'node': name})}\n\n"
                elif kind == "on_chat_model_stream" and name:
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
                    elif raw_chunk is not None:
                        chunk = getattr(raw_chunk, "content", None) or ""
                    chunk = chunk.strip()
                    if chunk:
                        yield f"event:node_stream\ndata:{json.dumps({'node': name, 'output': chunk})}\n\n"
                elif kind == "on_chain_end" and name not in (
                    None,
                    "LangGraph",
                    "pregel",
                ):
                    output = data.get("output") or {}
                    step_outputs = (
                        ((output or {}).get("step_outputs"))
                        if isinstance(output, dict)
                        else {}
                    ) or {}
                    if isinstance(step_outputs, dict):
                        outputs_map.update(step_outputs)
                    node_output = step_outputs.get(name) or ""
                    if not isinstance(node_output, str):
                        node_output = json.dumps(node_output, ensure_ascii=False)
                    logger.info(
                        f"[SSE] chain_end -> {name}, output={str(node_output)[:80]}"
                    )
                    yield f"event:node_end\ndata:{json.dumps({'node': name, 'output': node_output})}\n\n"
                elif kind == "on_stream_end":
                    output = event.get("data", {}).get("final_output", {}) or {}
                    steps_payload = []
                    executed = output.get("executed_steps", [])
                    outputs_map = output.get("step_outputs", outputs_map)
                    for sid in executed:
                        steps_payload.append(
                            {
                                "nodeId": sid,
                                "label": sid,
                                "output": outputs_map.get(sid, ""),
                                "status": "done",
                            }
                        )
                    yield f"event:done\ndata:{json.dumps({'steps': steps_payload, 'output': output})}\n\n"
        except Exception as e:
            logger.error("工作流异常", exc_info=True)
            yield f"event:error\ndata:{json.dumps({'error':str(e)})}\n\n"
            return

    async def _auto_summarize(self, session, project_id, outputs_map):
        outlines = await OutlineRepository(session).list_outlines(project_id)
        if not outlines:
            return
        raw = outlines[0].data
        volumes = raw if isinstance(raw, list) else raw.get("data", [])
        all_chapters = [ch for vol in volumes for ch in vol.get("chapters", [])]
        target = next(
            (ch for ch in all_chapters if not ch.get("summary") and ch.get("content")),
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
