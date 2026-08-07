"""SimRoom WebSocket 协议测试：认证、错误路径、事件序列。"""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest
from fastapi import WebSocketDisconnect
from starlette.testclient import TestClient

import domains.sim_rooms.router as sim_router
from main import app
from models.agent_memory import AgentMemory
from models.sim_room import SimBranch, SimMessage, SimParticipant, SimRoom


class ScalarListResult:
    def __init__(self, values):
        self.values = values

    def scalars(self):
        return self

    def all(self):
        return self.values


class FakeRoom:
    def __init__(self, room_id=1, user_id=1, status="active"):
        self.id = room_id
        self.user_id = user_id
        self.book_id = 1
        self.name = "测试房间"
        self.description = ""
        self.status = status
        self.location_id = None
        self.summary = None
        self.round_count = 0
        self.related_event_ids = []
        self.related_foreshadowing_ids = []
        self.related_plot_thread_ids = []


class FakeSession:
    """按模型/查询分派的最小 session。"""

    def __init__(self, room=None, participants=None, messages=None, memories=None):
        self.room = room
        self.participants = participants or []
        self.messages = messages or []
        self.memories = memories or []
        self.added = []

    async def get(self, model, ident):
        if model is SimRoom:
            return self.room
        return None

    async def execute(self, stmt):
        ent = stmt.column_descriptions[0]["entity"]
        if ent is SimParticipant:
            return ScalarListResult(self.participants)
        if ent is SimMessage:
            return ScalarListResult(self.messages)
        if ent is AgentMemory:
            class R:
                def scalar_one_or_none(self):
                    return None
            return R()
        return ScalarListResult(self.memories)

    async def commit(self):
        pass

    def add(self, obj):
        self.added.append(obj)

    async def flush(self):
        pass

    async def refresh(self, obj):
        pass


class FakeSessionCtx:
    def __init__(self, session):
        self.session = session

    async def __aenter__(self):
        return self.session

    async def __aexit__(self, *a):
        return False


def fake_factory(session):
    return lambda: FakeSessionCtx(session)


def install_ws_deps(monkeypatch, session: FakeSession, final_output: str = "AI 回复", should_end: bool = False):
    monkeypatch.setattr(sim_router, "db_manager", SimpleNamespace(session_factory=fake_factory(session)))
    monkeypatch.setattr(sim_router, "verify_token", lambda t: {"sub": "1"} if t else None)

    async def fake_stream_round(state, bridge, on_token):
        await on_token(final_output, "测试角色")
        return {
            "character_memories": {},
            "character_outputs": {"测试角色": "角色台词"},
            "scene_output": "夜色笼罩酒馆",
            "final_output": final_output,
            "director_decision": {"end_reason": "自然结束"},
            "should_end": should_end,
        }

    monkeypatch.setattr(sim_router, "stream_sim_round", fake_stream_round)

    class FakeLLM:
        async def ainvoke(self, prompt):
            text = str(prompt)
            if "给用户推荐" in text:
                return SimpleNamespace(content='{"items": [{"label": "推进剧情", "content": "让主角去查线索"}, {"label": "场景描写", "content": "描写黄昏酒馆"}]}')
            if "支线" in text:
                return SimpleNamespace(content='{"title": "酒馆夜话", "content": "主角在酒馆打听到关键线索。"}')
            return SimpleNamespace(content="摘要")

        async def astream(self, prompt):
            yield SimpleNamespace(content="开局白")

    monkeypatch.setattr(sim_router, "ModelFactory", lambda cfg: SimpleNamespace(main=FakeLLM(), tool=FakeLLM()))


def make_room_session():
    room = FakeRoom()
    char = SimpleNamespace(entity_type="character", entity_id=5, role_label="测试角色",
                           personality_override=None, description="角色描述")
    history = SimpleNamespace(sender_label="AI", sender_type="system", message_type="narration", content="已有对话")
    return FakeSession(room=room, participants=[char, SimpleNamespace(entity_type="user", entity_id=1)], messages=[history])


def make_empty_room_session():
    """新房间：无历史消息，触发开局提示流式块。"""
    room = FakeRoom()
    char = SimpleNamespace(entity_type="character", entity_id=5, role_label="测试角色",
                           personality_override=None, description="角色描述")
    return FakeSession(room=room, participants=[char, SimpleNamespace(entity_type="user", entity_id=1)], messages=[])


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_ws_rejects_room_not_found(monkeypatch, client):
    """房间不存在 → 关闭码 4004。"""
    monkeypatch.setattr(sim_router, "db_manager", SimpleNamespace(session_factory=fake_factory(FakeSession(room=None))))
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/api/sim-rooms/99/ws") as ws:
            ws.receive_text()
    assert exc.value.code == 4004


def test_ws_rejects_missing_token(monkeypatch, client):
    """无 token → 关闭码 4003。"""
    monkeypatch.setattr(sim_router, "db_manager", SimpleNamespace(session_factory=fake_factory(make_room_session())))
    monkeypatch.setattr(sim_router, "verify_token", lambda t: None)
    with pytest.raises(WebSocketDisconnect) as exc:
        with client.websocket_connect("/api/sim-rooms/1/ws") as ws:
            ws.receive_text()
    assert exc.value.code == 4003


def test_ws_full_round_protocol(monkeypatch, client):
    """完整一轮：connected → user_msg → stream_token → turn_done → end。"""
    session = make_room_session()
    install_ws_deps(monkeypatch, session, final_output="夜色渐深")

    with client.websocket_connect("/api/sim-rooms/1/ws?token=t1") as ws:
        first = json.loads(ws.receive_text())
        assert first["type"] == "connected"

        ws.send_text(json.dumps({"type": "chat", "content": "你们在聊什么？", "speakAs": "director"}))

        types = []
        payloads = []
        for _ in range(5):
            msg = json.loads(ws.receive_text())
            types.append(msg["type"])
            payloads.append(msg)
        assert types == ["user_msg", "stream_start", "stream_token", "turn_done", "suggestions"]
        assert payloads[2]["token"] == "夜色渐深"
        assert payloads[3]["roundCount"] == 1
        assert len(payloads[4]["items"]) == 2

        # 用户消息落库（dialogue）+ 场景落库（scene）+ 角色发言落库（dialogue）
        assert any(m.sender_type == "user" for m in session.added)
        assert any(m.sender_type == "system" and m.message_type == "scene" for m in session.added)
        assert any(m.sender_type == "system" and m.sender_label == "测试角色" and m.message_type == "dialogue" for m in session.added)

        ws.send_text(json.dumps({"type": "end", "generateSummary": True}))
        end_msg = json.loads(ws.receive_text())
        assert end_msg["type"] == "end"
        assert end_msg["summary"]
        assert session.room.status == "archived"


def test_ws_opening_prompt(monkeypatch, client):
    """新房间（无历史消息）→ 连接后自动生成开局开场白（流式）+ 建议卡片。"""
    session = make_empty_room_session()
    install_ws_deps(monkeypatch, session, final_output="夜色渐深")

    with client.websocket_connect("/api/sim-rooms/1/ws?token=t1") as ws:
        types = []
        payloads = []
        # connected + 开局（stream_start/stream_token/turn_done/suggestions）
        for _ in range(5):
            msg = json.loads(ws.receive_text())
            types.append(msg["type"])
            payloads.append(msg)
        assert types == ["connected", "stream_start", "stream_token", "turn_done", "suggestions"]
        assert payloads[2]["token"] == "开局白"
        assert len(payloads[4]["items"]) == 2
        # 开局开场白应落库为导演消息
        assert any(m.sender_type == "system" and m.sender_label == "导演" and m.content == "开局白" for m in session.added)


def test_ws_auto_end(monkeypatch, client):
    """导演判定应结束 → auto_end 事件。"""
    session = make_room_session()
    install_ws_deps(monkeypatch, session, final_output="结束", should_end=True)

    with client.websocket_connect("/api/sim-rooms/1/ws?token=t1") as ws:
        ws.receive_text()  # connected
        ws.send_text(json.dumps({"type": "chat", "content": "散场吧", "speakAs": "director"}))
        types = []
        while True:
            msg = json.loads(ws.receive_text())
            types.append(msg["type"])
            if msg["type"] in ("auto_end", "end"):
                break
        assert "stream_token" in types
        assert types[-1] == "auto_end"


def test_ws_auto_advance(monkeypatch, client):
    """AI 自动推进：一次请求连续驱动 turns 轮对话并流式输出。"""
    session = make_room_session()
    install_ws_deps(monkeypatch, session, final_output="夜色渐深")

    with client.websocket_connect("/api/sim-rooms/1/ws?token=t1") as ws:
        ws.receive_text()  # connected
        ws.send_text(json.dumps({"type": "auto_advance", "turns": 2}))

        types = []
        # 2 轮 × (stream_start/stream_token/turn_done) + suggestions
        for _ in range(7):
            msg = json.loads(ws.receive_text())
            types.append(msg["type"])
        assert types == [
            "stream_start", "stream_token", "turn_done",
            "stream_start", "stream_token", "turn_done",
            "suggestions",
        ]
        # 自动推进的消息不落库为用户消息，只落库 AI 输出
        assert not any(m.sender_type == "user" for m in session.added)


def test_ws_auto_advance_clamps_turns(monkeypatch, client):
    """turns 超上限时被钳制（最大 5）。"""
    session = make_room_session()
    install_ws_deps(monkeypatch, session, final_output="夜色渐深")

    with client.websocket_connect("/api/sim-rooms/1/ws?token=t1") as ws:
        ws.receive_text()  # connected
        ws.send_text(json.dumps({"type": "auto_advance", "turns": 99}))

        types = []
        while True:
            msg = json.loads(ws.receive_text())
            types.append(msg["type"])
            if msg["type"] == "suggestions":
                break
        # 5 轮（钳制后）输出
        assert types.count("turn_done") == 5


def test_ws_branch_creation(monkeypatch, client):
    """发送 branch 消息 → 生成支线并返回 branch_created 事件。"""
    session = make_room_session()
    install_ws_deps(monkeypatch, session)

    with client.websocket_connect("/api/sim-rooms/1/ws?token=t1") as ws:
        ws.receive_text()  # connected
        ws.send_text(json.dumps({"type": "branch", "branchType": "plot-thread"}))
        msg = json.loads(ws.receive_text())
        assert msg["type"] == "branch_created"
        assert msg["branch"]["title"] == "酒馆夜话"
        assert msg["branch"]["content"] == "主角在酒馆打听到关键线索。"
        assert msg["branch"]["branchType"] == "plot-thread"
        # 支线应落库
        assert any(isinstance(o, SimBranch) for o in session.added)
