from typing import Annotated

from config.logging import get_logger
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool
from langgraph.prebuilt import InjectedState
from models.book import Book, Chapter, CreativeSetting, Volume
from sqlalchemy import func, select

from domains.book.repository import CharacterRepository
from domains.world.derived_sync import recompute_derived
from domains.world.repository import WorldRepository

logger = get_logger(__name__)

EXTEND_OUTLINE_SYSTEM_PROMPT = """你是小说大纲规划师。根据已有内容，为书籍追加新章节大纲。

**任务要求：**
1. 生成 N 章标题和摘要（每个摘要 50 字以内，涵盖章内关键情节）
2. 为每章生成 3~5 个 SceneEvent（场景事件）：每个含 name/description/event_type
3. 为每个 SceneEvent 自动关联已知地点(location_id)、角色(character_ids)、情节线(plot_thread_ids)
4. 如果某条情节线在此次追加的场景中完结，在该场景事件标注 completed_plot_thread_ids
5. 如果某个伏笔在此次追加的场景中揭晓，在该场景事件标注 resolved_foreshadowing_ids

**输出格式（严格 JSON）：**
{
  "chapters": [
    {
      "title": "第X章 章标题",
      "summary": "50字以内摘要",
      "scene_events": [
        {
          "name": "场景事件名",
          "description": "事件描述",
          "event_type": "scene/event/milestone",
          "story_label": "时间标签（如'第一天上午'）",
          "location_id": null,
          "character_ids": [],
          "plot_thread_ids": [],
          "completed_plot_thread_ids": [],
          "resolved_foreshadowing_ids": []
        }
      ],
      "thread_updates": [{"thread_id": 1, "end_chapter": true}],
      "foreshadowing_updates": [{"foreshadowing_id": 3, "resolved": true}]
    }
  ],
  "new_volume_needed": false
}
"""

# 兼容旧输出：thread_updates / foreshadowing_updates 仍会被处理（等价于在该章第一个场景事件上标注）
_LEGACY_THREAD_UPDATES_SUPPORTED = True


async def _get_next_batch_number(session, book_id: int) -> int:
    """计算下一批次的 generation_batch 编号。"""
    result = await session.execute(
        select(func.max(Chapter.generation_batch)).where(Chapter.volume_id.in_(
            select(Volume.id).where(Volume.book_id == book_id)
        ))
    )
    max_batch = result.scalar() or 0
    return max_batch + 1


async def _get_last_sort_order(session, volume_id: int) -> int:
    """获取指定卷中最后一章的 sort_order。"""
    result = await session.execute(
        select(func.max(Chapter.sort_order)).where(Chapter.volume_id == volume_id)
    )
    return result.scalar() or 0


async def _get_last_scene_event_sort_order(session, chapter_id: int) -> int:
    """获取章节中最后一个场景事件的 sort_order。"""
    from models.book import SceneEvent
    result = await session.execute(
        select(func.max(SceneEvent.sort_order)).where(SceneEvent.chapter_id == chapter_id)
    )
    return result.scalar() or 0


def build_extend_outline_tool(session_factory, model_config: dict | None = None):
    """构建 extend_outline 工具。

    Args:
        session_factory: 数据库会话工厂。
        model_config: 模型配置。

    Returns:
        Tool 实例。
    """

    @tool
    async def generate_outline_extension(
        chapter_count: Annotated[int, "追加的章数（1~100）"],
        instruction: Annotated[str | None, "额外的创作指令，如风格要求、方向建议"] = None,
        user_id: Annotated[int, InjectedState("user_id")] = 0,
        book_id: Annotated[int, InjectedState("active_book_id")] = 0,
    ) -> dict:
        """根据已有内容，为书籍追加新章节大纲，含标题、摘要、场景事件及线索/伏笔更新。

        当 Agent 检测到大纲不足（如剩余章数 < 3）或用户要求时调用此工具。

        Args:
            chapter_count: 追加章数，范围 1~100。
            instruction: 额外创作指令，用自然语言描述期望的方向。
        """
        chapter_count = max(1, min(100, chapter_count))
        logger.debug(f"[tool] generate_outline_extension  book_id={book_id}  count={chapter_count}")

        if not book_id:
            return {"status": "error", "message": "未选择活动书籍"}

        async with session_factory() as session:
            book_stmt = select(Book).where(Book.id == book_id)
            book_result = await session.execute(book_stmt)
            book = book_result.scalar_one_or_none()
            if not book:
                return {"status": "error", "message": "书籍不存在"}

            world_repo = WorldRepository(session)
            char_repo = CharacterRepository(session)

            characters = await char_repo.book_character_detail(
                user_id=book.user_id, book_id=book_id
            )
            locations = await world_repo.list_locations(book_id)
            foreshadowings = await world_repo.list_foreshadowings(book_id)
            open_foreshadowings = [
                f for f in foreshadowings
                if f.status == "planted" and not f.resolved_at_chapter_id
            ]
            plot_threads = await world_repo.list_plot_threads(book_id)
            active_threads = [
                t for t in plot_threads
                if t.status == "active" and not t.end_chapter_id
            ]

            vol_stmt = select(Volume).where(Volume.book_id == book_id).order_by(Volume.sort_order, Volume.id)
            vol_result = await session.execute(vol_stmt)
            volumes = vol_result.scalars().all()

            if not volumes:
                return {"status": "error", "message": "请先初始化书籍大纲（创建至少一卷一章）"}

            ch_stmt = select(Chapter).where(
                Chapter.volume_id.in_([v.id for v in volumes])
            ).order_by(Chapter.sort_order, Chapter.id)
            ch_result = await session.execute(ch_stmt)
            existing_chapters = ch_result.scalars().all()

            if not existing_chapters:
                return {"status": "error", "message": "请先初始化书籍大纲"}

            scene_events = await world_repo.list_scene_events(book_id)
            last_event = scene_events[-1] if scene_events else None
            last_story_ts = last_event.story_ts if last_event else 0.0
            last_story_label = last_event.story_label if last_event else ""

            creative_stmt = select(CreativeSetting).where(CreativeSetting.book_id == book_id)
            creative_result = await session.execute(creative_stmt)
            creative_setting = creative_result.scalar_one_or_none()

            context_parts = []
            context_parts.append(f"书名：{book.title}\n类型：{book.genre or '未知'}\n简介：{book.description or '无'}")
            if creative_setting:
                if creative_setting.tone:
                    context_parts.append(f"文风：{creative_setting.tone[:300]}")
                if creative_setting.worldview:
                    context_parts.append(f"世界观：{creative_setting.worldview[:500]}")

            if characters:
                chars_text = "\n".join([
                    f"- [{c.id}] {c.name}（{c.role_type or '角色'}）：{(c.description or '')[:200]}"
                    for c in characters[:20]
                ])
                context_parts.append(f"现有角色：\n{chars_text}")

            if locations:
                locs_text = "\n".join([
                    f"- [{loc.id}] {loc.name}（{loc.type}）：{loc.description or ''[:150]}"
                    for loc in locations[:15]
                ])
                context_parts.append(f"现有地点：\n{locs_text}")

            if existing_chapters:
                chapter_text = "\n".join([
                    f"- 第{c.sort_order}章 {c.title}：{c.summary or '暂无摘要'}"
                    for c in existing_chapters
                ])
                context_parts.append(f"已有大纲（共{len(existing_chapters)}章）：\n{chapter_text}")

            if active_threads:
                threads_text = "\n".join([
                    f"- [{t.id}] {t.name}（{t.type}）：{(t.description or '')[:200]}"
                    for t in active_threads
                ])
                context_parts.append(f"进行中的情节线：\n{threads_text}")
            else:
                context_parts.append("当前无进行中的未完结情节线")

            if open_foreshadowings:
                fores_text = "\n".join([
                    f"- [{f.id}] {f.description[:200]}（planted at chapter {f.planted_at_chapter_id}）"
                    for f in open_foreshadowings
                ])
                context_parts.append(f"未回收的伏笔：\n{fores_text}")
            else:
                context_parts.append("当前无未回收的伏笔")

            if last_event:
                context_parts.append(f"最后事件：{last_event.title} - {(last_event.content or '')[:200]}")

            user_instruction = f"\n\n额外创作指令：{instruction}" if instruction else ""
            human_content = (
                f"请为《{book.title}》追加 {chapter_count} 章大纲。\n\n"
                + "\n\n".join(context_parts)
                + f"\n\n已有 {len(existing_chapters)} 章，新章从第 {len(existing_chapters) + 1} 章开始。"
                + f"\n有 {len(active_threads)} 条进行中的情节线、{len(open_foreshadowings)} 个未回收伏笔可供推进。"
                + f"\n最后故事时间标签：{last_story_label}，偏移量：{last_story_ts}"
                + user_instruction
            )

            llm = None
            if model_config:
                from core.model_factory import ModelFactory
                try:
                    llm = ModelFactory(model_config)
                except Exception as exc:
                    logger.warning(f"extend_outline 初始化模型失败: {exc}")
            if llm is None:
                return {"status": "error", "message": "模型未配置"}

            messages = [
                SystemMessage(content=EXTEND_OUTLINE_SYSTEM_PROMPT),
                HumanMessage(content=human_content),
            ]

            result_data = None
            try:
                response = await llm.main.ainvoke(messages)
                raw_text = response.content if hasattr(response, "content") else str(response)
                import json as json_lib
                import re
                # 剥离 markdown 代码块围栏（```json ... ```）
                text = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw_text.strip(), flags=re.MULTILINE)
                # 取第一个 { 到最后一个 } 的切片：兼容任意嵌套深度（原正则只支持一层嵌套，会截断 chapters）
                start, end = text.find("{"), text.rfind("}")
                if start != -1 and end > start:
                    result_data = json_lib.loads(text[start:end + 1])
            except Exception as exc:
                logger.warning(f"extend_outline JSON 解析失败: {exc}")

            if not result_data:
                return {"status": "error", "message": "大纲生成失败：无法解析 AI 输出"}

            chapters_data = result_data.get("chapters", [])
            if not chapters_data:
                return {"status": "error", "message": "大纲生成失败：无章节数据"}

            batch_number = await _get_next_batch_number(session, book_id)
            last_volume = volumes[-1]
            created_chapters = []
            created_events = []

            chapter_count_in_last_vol = sum(1 for c in existing_chapters if c.volume_id == last_volume.id)
            if chapter_count_in_last_vol >= 20:
                max_sort = max((v.sort_order for v in volumes), default=0)
                new_vol = Volume(
                    book_id=book_id,
                    title=f"第{max_sort + 1}卷",
                    sort_order=max_sort + 1,
                )
                session.add(new_vol)
                await session.flush()
                last_volume = new_vol
                base_sort_order = 0
            else:
                base_sort_order = await _get_last_sort_order(session, last_volume.id)

            for i, ch_data in enumerate(chapters_data):
                title = ch_data.get("title", f"第{len(existing_chapters) + i + 1}章")
                summary = ch_data.get("summary", "")

                new_chapter = Chapter(
                    volume_id=last_volume.id,
                    title=title[:200],
                    summary=summary[:500] if summary else "",
                    sort_order=base_sort_order + i + 1,
                    locked=False,
                    generation_batch=batch_number,
                )
                session.add(new_chapter)
                await session.flush()
                created_chapters.append(new_chapter)

                for j, se_data in enumerate(ch_data.get("scene_events", [])):
                    from models.book import SceneEvent
                    new_event = SceneEvent(
                        book_id=book_id,
                        chapter_id=new_chapter.id,
                        title=se_data.get("name", se_data.get("title", "事件"))[:200],
                        content=se_data.get("description", se_data.get("content", ""))[:500],
                        sort_order=j + 1,
                        event_type=se_data.get("event_type", "scene"),
                        story_ts=last_story_ts + (i * 10 + j),
                        story_label=se_data.get("story_label", ""),
                        location_id=se_data.get("location_id"),
                        character_ids=se_data.get("character_ids", []),
                        plot_thread_ids=se_data.get("plot_thread_ids", []),
                        completed_plot_thread_ids=se_data.get("completed_plot_thread_ids", []),
                        resolved_foreshadowing_ids=se_data.get("resolved_foreshadowing_ids", []),
                    )
                    session.add(new_event)
                    created_events.append(new_event)

                # 兼容旧输出：thread_updates / foreshadowing_updates 等价于在本章第一个场景事件上标注
                for tu in ch_data.get("thread_updates", []):
                    tid = tu.get("thread_id")
                    if tid and tu.get("end_chapter"):
                        for t in plot_threads:
                            if t.id == tid:
                                t.end_chapter_id = new_chapter.id
                                t.status = "completed"
                                if created_events:
                                    ev = created_events[-1]
                                    cur = list(ev.completed_plot_thread_ids or [])
                                    if tid not in cur:
                                        ev.completed_plot_thread_ids = cur + [tid]

                for fu in ch_data.get("foreshadowing_updates", []):
                    fid = fu.get("foreshadowing_id")
                    if fid and fu.get("resolved"):
                        for f in foreshadowings:
                            if f.id == fid:
                                f.resolved_at_chapter_id = new_chapter.id
                                f.status = "resolved"
                                if created_events:
                                    ev = created_events[-1]
                                    cur = list(ev.resolved_foreshadowing_ids or [])
                                    if fid not in cur:
                                        ev.resolved_foreshadowing_ids = cur + [fid]

            await session.commit()

            # 追加大纲后统一重算派生字段（情节线起止/角色/状态、伏笔埋下/揭示章节）
            await recompute_derived(session, book_id)

            return {
                "status": "completed",
                "book_id": book_id,
                "chapters_created": len(created_chapters),
                "chapter_ids": [c.id for c in created_chapters],
                "events_created": len(created_events),
                "generation_batch": batch_number,
                "new_chapter_count": len(existing_chapters) + len(created_chapters),
            }

    return generate_outline_extension
