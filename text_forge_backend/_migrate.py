from pathlib import Path
base = Path(r"C:\Users\Anyi\Documents\PycharmProjects\TextForge\text_forge_backend")

# --- schema/response/book.py ---
t = (base / "schema/response/book.py").read_text("utf-8")
old = "class ChapterNodeResponse"
new = "class SceneEventResponse"
t = t.replace(old, new)
# Also update fields
t = t.replace(
    '    chapter_id: int = Field(alias="chapterId")',
    '    book_id: int = Field(alias="bookId")\n    chapter_id: int | None = Field(default=None, alias="chapterId")'
)
# Add new SceneEvent fields before character_ids
t = t.replace(
    '    character_ids: list[int] = Field(default=[], alias="characterIds")\n    locked: bool = Field(default=False)\n    created_at: datetime',
    '    event_type: str = Field(alias="eventType")\n    story_ts: float | None = Field(default=0, alias="storyTs")\n    story_label: str | None = Field(default=None, alias="storyLabel")\n    location_id: int | None = Field(default=None, alias="locationId")\n    character_ids: list[int] = Field(default=[], alias="characterIds")\n    locked: bool = Field(default=False)\n    created_at: datetime'
)
(base / "schema/response/book.py").write_text(t, "utf-8")

# --- schema/request/book.py ---
t = (base / "schema/request/book.py").read_text("utf-8")
t = t.replace("ChapterNodeRequest", "SceneEventRequest")
t = t.replace(
    '    title: str\n    content: str | None = None\n    character_ids: list[int] = Field(default_factory=list, alias="characterIds")\n    locked: bool | None = None',
    '    book_id: int = Field(alias="bookId")\n    title: str\n    content: str | None = None\n    event_type: str = Field(default="scene", alias="eventType")\n    story_ts: float | None = Field(default=0, alias="storyTs")\n    story_label: str | None = Field(default=None, alias="storyLabel")\n    chapter_id: int | None = Field(default=None, alias="chapterId")\n    location_id: int | None = Field(default=None, alias="locationId")\n    character_ids: list[int] = Field(default_factory=list, alias="characterIds")\n    locked: bool | None = None'
)
(base / "schema/request/book.py").write_text(t, "utf-8")

print("Schemas done")
