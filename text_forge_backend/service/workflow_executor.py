import json
from typing import AsyncGenerator
from infrastructure.database import db_manager
from repository.model_repo import ModelConfRepository
from agents.state import ParentState
from repository.project_repo import (
    BriefRepository,
    CharacterRepository,
    ProjectRepository,
    StepRepository,
)
from repository.workflow_repo import WorkflowRepository
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
            "compression": instance.compression or {},
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
        project_repo = ProjectRepository(self.session)
        project = await project_repo.get(project_id)
        if not project or project.user_id != user_id:
            raise ValueError("项目不存在")
        parts = [f"#项目标题\n{project.title}"]
        if project.description:
            parts.append(f"#项目描述\n{project.description}")
        if project.genre:
            parts.append(f"类型\n{project.genre}")

        brief_repo = BriefRepository(self.session)
        brief = await brief_repo.get_brief(project_id)
        if brief:
            parts.append(f"# 世界观\n{brief.worldview or ''}")
            parts.append(f"# 文风/基调\n{brief.tone or ''}")
            parts.append(f"# 创作禁忌\n{brief.forbidden or ''}")
            parts.append(f"# 风格指南\n{brief.style_guide or ''}")

        char_repo = CharacterRepository(self.session)
        characters = await char_repo.project_character_detail(user_id, project_id)
        if characters:
            char_lines = [f"-{c.name}:{c.description}" for c in characters]
            parts.append(f"#角色设定\n" + "\n".join(char_lines))

        step_repo = StepRepository(self.session)
        steps = await step_repo.step_detail(project_id)
        if steps:
            step_lines = []
            for s in steps:
                if s.content:
                    step_lines.append(f"##{s.agent_name or s.agent}\n{s.content}")
            if step_lines:
                parts.append("#已有正文\n" + "\n".join(step_lines))

        input_text = "\n\n".join(parts)
        nodes = self._topological_store(workflow.nodes or [])  # type: ignore
        model_config = await self._get_user_model_config(user_id)

        inital_state: ParentState = {
            "input_messages": input_text,
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
            async for event in parent_graph.astream_events(
                inital_state, config=config, version="v2"  # type: ignore
            ):  # type: ignore
                kind = event.get("event")
                if kind == "on_node_start":
                    node_name = event.get("data", {}).get("node")
                    yield f"event:node_start\ndata:{json.dumps({'node':node_name})}\n\n"
                elif kind == "on_node_end":
                    node_data = event.get("data", {})
                    node_name = node_data.get("node")
                    node_output = node_data.get("output", "")
                    if not isinstance(node_output, str):
                        node_output = json.dumps(node_output, ensure_ascii=False) if node_output is not None else ""
                    yield f"event:node_end\ndata:{json.dumps({'node': node_name, 'output': node_output})}\n\n"
                elif kind == "on_stream_end":
                    output = event.get("data", {}).get("final_output", {})
                    steps_payload = []
                    executed = output.get("executed_steps", [])
                    outputs_map = output.get("step_outputs", {})
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
            logger.error(f"工作流执行异常", exc_info=True)
            yield f"event:error\ndata:{json.dumps({'error':str(e)})}\n\n"
