"""graph.stream_sim_round 流式执行测试：token 回调、场景/角色分流、记忆压缩静默失败。"""

import json
from types import SimpleNamespace

import pytest

from domains.sim_rooms import graph as sim_graph
from domains.sim_rooms import context_loader
from shared.database import db_manager


class _MemRecord:
    def __init__(self, source, content):
        self.source = source
        self.content = content


class _MemStore:
    def __init__(self):
        self.records: list[_MemRecord] = []
        self.commits = 0


class _MemResult:
    def __init__(self, record):
        self._record = record

    def scalar_one_or_none(self):
        return self._record


class _MemSession:
    """可提交、可持久化 AgentMemory 插入的假会话，用于验证 _execute_sql 是否落库。"""

    def __init__(self, store: _MemStore):
        self._store = store

    async def execute(self, stmt):
        from sqlalchemy.sql import Insert, Update

        if isinstance(stmt, Insert):
            params = dict(stmt.compile().params)
            self._store.records.append(
                _MemRecord(params.get("source"), params.get("content"))
            )
            self._store.commits += 1
            return _MemResult(None)
        if isinstance(stmt, Update):
            self._store.commits += 1
            return _MemResult(None)
        # select：返回已落库的最新记录（无则 None）
        self._store.commits += 1
        return _MemResult(self._store.records[-1] if self._store.records else None)

    async def commit(self):
        self._store.commits += 1


class _MemCM:
    def __init__(self, session: _MemSession):
        self._session = session

    async def __aenter__(self):
        return self._session

    async def __aexit__(self, *args):
        return False


class _MemFactory:
    def __init__(self, store: _MemStore):
        self._store = store

    def __call__(self):
        return _MemCM(_MemSession(self._store))


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


@pytest.mark.asyncio
async def test_compress_persists_memory_via_execute_sql(monkeypatch):
    """compress 经真实 _execute_sql 写入后，AgentMemory 落库（source=sim_room:{room_id}:char:{char_id}）。

    回归 P0-2：_execute_sql 此前只 execute 不 commit，会话关闭后 insert/update 回滚，
    角色记忆从未落库，连带 router 记忆清理永远删 0 行。
    """
    store = _MemStore()
    # 用可提交、可持久化插入的假 session_factory 替换真实 DB，验证真实 _execute_sql 是否 commit 并落库
    monkeypatch.setattr(db_manager, "session_factory", _MemFactory(store))
    monkeypatch.setattr(sim_graph, "ModelFactory", lambda cfg: fake_llm())

    state = make_state()
    # 触发压缩：round_count 为 COMPRESS_EVERY 整数倍且非 0
    state["round_count"] = 5
    state["recent_history"] = ["[导演][narration] 黄昏酒馆里", "[测试角色][dialogue] 你好"]

    bridge = {
        "execute_sql": context_loader.execute_sql,
        "room_id": 1, "user_id": 1, "book_id": 1, "model_config": {},
    }
    result = await sim_graph.compress_memories_node(state, bridge)

    # 真实 _execute_sql 每条语句后都 commit，至少 select/insert 各触发一次
    assert store.commits > 0
    # AgentMemory 记录已落库，source 符合约定前缀
    assert any(r.source == "sim_room:1:char:5" for r in store.records)
    # 压缩后的记忆回写 state
    assert result["character_memories"]["测试角色"] == "回复内容"

