import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from config.logging import get_logger
from core.model_factory import ModelFactory
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage

logger = get_logger(__name__)

CARD_TYPES = {
    "world_setup": "世界观设定",
    "plot_direction": "故事走向",
    "character_intro": "角色",
    "location_card": "地点",
    "foreshadow_card": "伏笔",
    "char_dialogue": "角色对话模拟",
    "custom": "用户自定义",
}

SESSION_TIMEOUT_SECONDS = 30 * 60
MAX_CONCURRENT_CARDS_PER_USER = 5


@dataclass
class CardSession:
    card_id: str
    user_id: int
    book_id: int
    card_type: str
    title: str
    model_config: dict
    messages: list[Any] = field(default_factory=list)
    created_at: float = field(default_factory=time.time)
    last_activity: float = field(default_factory=time.time)
    opened: bool = True

    def touch(self):
        self.last_activity = time.time()

    def is_expired(self) -> bool:
        return (time.time() - self.last_activity) > SESSION_TIMEOUT_SECONDS

    async def chat(self, user_message: str) -> str:
        self.touch()
        self.messages.append(HumanMessage(content=user_message))
        llm = ModelFactory(self.model_config)
        result = await llm.main.ainvoke(self.messages)
        content = result.content if hasattr(result, "content") else str(result)
        self.messages.append(result)
        return content

    async def chat_stream(self, user_message: str):
        self.touch()
        self.messages.append(HumanMessage(content=user_message))
        llm = ModelFactory(self.model_config)
        full_response = ""
        async for chunk in llm.main.astream(self.messages):
            token = chunk.content if hasattr(chunk, "content") else str(chunk)
            if token:
                full_response += token
                yield token
        self.messages.append(AIMessage(content=full_response))

    async def simulate_dialogue(
        self, characters: list[str], setting: str
    ) -> str:
        self.touch()
        system = SystemMessage(
            content=f"你正在扮演{', '.join(characters)}。在{setting}中对话。请自然地模拟角色之间的对话。"
        )
        llm = ModelFactory(self.model_config)
        result = await llm.main.ainvoke([system, HumanMessage(content="开始对话")])
        content = result.content if hasattr(result, "content") else str(result)
        self.messages.append(result)
        return content


class CardSessionManager:
    def __init__(self):
        self._sessions: dict[str, CardSession] = {}

    def _cleanup_expired(self):
        expired = [cid for cid, cs in self._sessions.items() if cs.is_expired()]
        for cid in expired:
            self.close(cid)

    def open(
        self, user_id: int, book_id: int, card_type: str, title: str, model_config: dict
    ) -> tuple[CardSession | None, str | None]:
        self._cleanup_expired()
        user_count = sum(1 for cs in self._sessions.values() if cs.user_id == user_id and cs.opened)
        if user_count >= MAX_CONCURRENT_CARDS_PER_USER:
            return None, f"并发卡片数量已达上限 ({MAX_CONCURRENT_CARDS_PER_USER})"

        card_id = str(uuid.uuid4())
        session = CardSession(
            card_id=card_id,
            user_id=user_id,
            book_id=book_id,
            card_type=card_type,
            title=title,
            model_config=model_config,
        )
        self._sessions[card_id] = session
        return session, None

    def get(self, card_id: str) -> CardSession | None:
        self._cleanup_expired()
        session = self._sessions.get(card_id)
        if session and not session.opened:
            return None
        if session:
            session.touch()
        return session

    def close(self, card_id: str):
        session = self._sessions.get(card_id)
        if session:
            session.opened = False
            del self._sessions[card_id]

    def confirm(self, card_id: str) -> dict | None:
        session = self._sessions.get(card_id)
        if not session or not session.opened:
            return None
        result = {
            "card_id": card_id,
            "card_type": session.card_type,
            "title": session.title,
            "messages": [
                {"role": getattr(m, "type", "unknown"), "content": getattr(m, "content", "")}
                for m in session.messages
            ],
        }
        self.close(card_id)
        return result


card_session_manager = CardSessionManager()
