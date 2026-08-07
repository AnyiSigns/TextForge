"""graph.stream_sim_round 流式执行测试：token 回调、场景/角色分流、记忆压缩静默失败。"""

import json
from types import SimpleNamespace

import pytest

from domains.sim_rooms import graph as sim_graph


def make_state(decision=None, action="speak", speakers=None):
    return {
        "room_id": 1,
        "round_count": 1,
        "should_end": False,
        "last_user_input": "你们在聊什么？",
        "speak_as": "director",
        "room_setting": "黄昏酒馆 · 昏黄的灯光下",
        "character_details": [
            {"role_label": "测试角色", "entity_type": "character", "entity_id": 5, "description": "冷静寡言的剑客"},
        ],
        "character_memories": {},
        "model_config": {},
        "recent_history": [],
        "director_decision": decision,
        "character_outputs": {},
        "scene_output": None,
        "final_output": "",
    }


def fake_llm(text_map=None):
    class FakeModel:
        async def ainvoke(self, prompt):
            text = str(prompt)
            if "输出 JSON" in text or "只输出 JSON" in text:
                return SimpleNamespace(content=json.dumps({"action": "speak", "speakers": ["测试角色"], "tone": "紧张"}))
            return SimpleNamespace(content=text_map or "回复内容")

        async def astream(self, prompt):
            yield SimpleNamespace(content="角色流式回复")

    return SimpleNamespace(main=FakeModel(), tool=FakeModel())


@pytest.mark.asyncio
async def test_stream_round_calls_on_token(monkeypatch):
    """角色发言流式：on_token 收到模型输出片段。"""
    monkeypatch.setattr(sim_graph, "ModelFactory", lambda cfg: fake_llm())
    state = make_state()

    tokens: list[tuple[str, str]] = []

    async def on_token(piece: str, speaker: str) -> None:
        tokens.append((piece, speaker))

    result = await sim_graph.stream_sim_round(state, {"execute_sql": None, "room_id": 1, "user_id": 1, "book_id": 1, "model_config": {}}, on_token)
    assert tokens == [("角色流式回复", "测试角色")]
    assert result["character_outputs"]["测试角色"] == "角色流式回复"
    assert "测试角色：角色流式回复" in result["final_output"]


@pytest.mark.asyncio
async def test_stream_round_scene_action(monkeypatch):
    """场景动作：只流式场景描写，不进入角色发言。"""
    tokens: list[tuple[str, str]] = []

    class FakeSceneModel:
        async def astream(self, prompt):
            yield SimpleNamespace(content="酒馆里烛火摇曳")

    monkeypatch.setattr(sim_graph, "ModelFactory", lambda cfg: SimpleNamespace(main=FakeSceneModel(), tool=FakeSceneModel()))

    async def fake_director(state):
        return {"director_decision": {"action": "scene", "scene_focus": "烛火", "tone": "紧张"}, "should_end": False}

    monkeypatch.setattr(sim_graph, "director_decide_node", fake_director)

    state = make_state()

    async def on_token(piece: str, speaker: str) -> None:
        tokens.append((piece, speaker))

    result = await sim_graph.stream_sim_round(state, {"execute_sql": None, "room_id": 1, "user_id": 1, "book_id": 1, "model_config": {}}, on_token)
    assert tokens == [("酒馆里烛火摇曳", "场景")]
    assert result["scene_output"] == "酒馆里烛火摇曳"


@pytest.mark.asyncio
async def test_stream_round_should_end(monkeypatch):
    """导演判定结束：不流式，直接返回。"""

    async def fake_director(state):
        return {"director_decision": {"action": "end", "end_reason": "自然结束"}, "should_end": True}

    monkeypatch.setattr(sim_graph, "director_decide_node", fake_director)

    tokens: list[tuple[str, str]] = []
    state = make_state()

    async def on_token(piece: str, speaker: str) -> None:
        tokens.append((piece, speaker))

    result = await sim_graph.stream_sim_round(state, {"execute_sql": None, "room_id": 1, "user_id": 1, "book_id": 1, "model_config": {}}, on_token)
    assert tokens == []
    assert result["should_end"] is True


@pytest.mark.asyncio
async def test_stream_round_compress_failure_silent(monkeypatch):
    """记忆压缩失败时静默降级，不影响流式输出与最终结果。"""

    async def fake_compress(state, bridge):
        raise RuntimeError("压缩失败")

    monkeypatch.setattr(sim_graph, "compress_memories_node", fake_compress)
    monkeypatch.setattr(sim_graph, "ModelFactory", lambda cfg: fake_llm())

    tokens: list[tuple[str, str]] = []
    state = make_state()

    async def on_token(piece: str, speaker: str) -> None:
        tokens.append((piece, speaker))

    result = await sim_graph.stream_sim_round(state, {"execute_sql": None, "room_id": 1, "user_id": 1, "book_id": 1, "model_config": {}}, on_token)
    assert tokens == [("角色流式回复", "测试角色")]
    assert "测试角色：角色流式回复" in result["final_output"]
