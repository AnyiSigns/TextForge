from typing import Annotated
import json
import traceback

from config.logging import get_logger
from core.auth import get_current
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from shared.database import db_manager
from .schemas import (
    BatchCreateRequest,
    CharacterRelationRequest,
    GenerateRequest,
    OutlineRequest,
    RegenerateRequest,
)
from .service import generate_cards

logger = get_logger(__name__)
router = APIRouter(prefix="/wizard", tags=["Wizard"])


async def _do_generate(step: str, model_config_data: dict | None, context: dict,
                     requirements: str = "", batch_size: int = 4, extra: dict | None = None):
    try:
        result = await generate_cards(
            step=step,
            model_config_data=model_config_data,
            context=context,
            requirements=requirements,
            batch_size=batch_size,
            extra=extra,
        )
        if result.get("error"):
            raise HTTPException(status_code=400, detail=result["error"])
        return {"cards": result.get("cards", []), "step": step}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception(f"wizard {step} 失败")
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/generate/creative-setting")
async def generate_creative_setting(
    user_id: Annotated[int, Depends(get_current)],
    request: GenerateRequest,
):
    print("[wizard] creative_setting 端点被调用", flush=True)
    try:
        data = await _do_generate("creative_setting", request.model_config_data,
                                  request.context, request.requirements, request.batch_size,
                                  extra={"variation": request.variation})
        print(f"[wizard] creative_setting 返回 cards={len(data.get('cards', []))}", flush=True)
        return JSONResponse(content=data)
    except Exception:
        err = traceback.format_exc()
        print(err, flush=True)
        return JSONResponse(status_code=500, content={"detail": err})


@router.post("/generate/locations")
async def generate_locations(
    user_id: Annotated[int, Depends(get_current)],
    request: GenerateRequest,
):
    return await _do_generate("locations", request.model_config_data,
                              request.context, request.requirements, request.batch_size)


@router.post("/generate/characters")
async def generate_characters(
    user_id: Annotated[int, Depends(get_current)],
    request: GenerateRequest,
):
    return await _do_generate("characters", request.model_config_data,
                              request.context, request.requirements, request.batch_size)


@router.post("/generate/character-relations")
async def generate_character_relations(
    user_id: Annotated[int, Depends(get_current)],
    request: CharacterRelationRequest,
):
    return await _do_generate("character_relations", request.model_config_data,
                              {"characters": request.characters}, request.requirements,
                              extra={"characters": request.characters})


@router.post("/generate/timeline-foreshadowing")
async def generate_timeline_foreshadowing(
    user_id: Annotated[int, Depends(get_current)],
    request: GenerateRequest,
):
    return await _do_generate("timeline_foreshadowing", request.model_config_data,
                              request.context, request.requirements, request.batch_size)


@router.post("/generate/plot-threads")
async def generate_plot_threads(
    user_id: Annotated[int, Depends(get_current)],
    request: GenerateRequest,
):
    return await _do_generate("plot_threads", request.model_config_data,
                              request.context, request.requirements, request.batch_size)


@router.post("/generate/outline")
async def generate_outline(
    user_id: Annotated[int, Depends(get_current)],
    request: OutlineRequest,
):
    extra = {
        "volume_count": request.volume_count,
        "chapters_per_volume": request.chapters_per_volume,
        "nodes_per_chapter": request.nodes_per_chapter,
        "mode": request.mode,
    }
    return await _do_generate("outline", request.model_config_data,
                              request.context, request.requirements,
                              extra=extra)


@router.post("/regenerate")
async def regenerate_cards(
    user_id: Annotated[int, Depends(get_current)],
    request: RegenerateRequest,
):
    requirements_parts = [request.requirements]
    for idx, req in request.per_card_requirements.items():
        requirements_parts.append(f"卡片#{idx}: {req}")
    merged_requirements = "; ".join(filter(None, requirements_parts))

    return await _do_generate(request.step, request.model_config_data,
                              request.context, merged_requirements,
                              batch_size=len(request.card_indices))


@router.post("/batch-create")
async def batch_create(
    user_id: Annotated[int, Depends(get_current)],
    request: BatchCreateRequest,
    session: Annotated[AsyncSession, Depends(db_manager.get_db)] = None,
):
    from domains.book.chapter_repository import ChapterRepository
    from domains.book.volume_repository import VolumeRepository
    from domains.world.repository import WorldRepository
    from models.book import Character, Chapter, ChapterNode, Foreshadowing, PlotThread, Volume

    created: dict[str, list] = {}
    try:
        if request.step == "creative_setting":
            from models.book import CreativeSetting
            entity = request.entities[0] if request.entities else {}
            custom_dims_raw = entity.get("custom_dimensions", "{}")
            if isinstance(custom_dims_raw, str):
                try:
                    custom_dims_raw = json.loads(custom_dims_raw)
                except (json.JSONDecodeError, TypeError):
                    dims = {}
                    for line in custom_dims_raw.strip().split("\n"):
                        line = line.strip()
                        if not line:
                            continue
                        sep = "：" if "：" in line else ":"
                        parts = line.split(sep, 1)
                        if len(parts) == 2:
                            dims[parts[0].strip()] = parts[1].strip()
                    custom_dims_raw = dims if dims else {}
            if not isinstance(custom_dims_raw, dict):
                custom_dims_raw = {}
            instance = CreativeSetting(
                book_id=request.book_id,
                tone=entity.get("tone", ""),
                worldview=entity.get("worldview", ""),
                writing_taboos=entity.get("writing_taboos", ""),
                custom_dimensions=custom_dims_raw,
            )
            session.add(instance)
            created.setdefault("creative_settings", []).append(entity)
            await session.commit()

        elif request.step == "locations":
            repo = WorldRepository(session)
            for entity in request.entities:
                instance = await repo.create_location(request.book_id, entity)
                created.setdefault("locations", []).append({"id": instance.id, "name": instance.name})

        elif request.step == "characters":
            for entity in request.entities:
                instance = Character(user_id=user_id, book_id=request.book_id, **entity)
                session.add(instance)
                created.setdefault("characters", []).append(entity)
            await session.commit()

        elif request.step == "timeline_foreshadowing":
            repo = WorldRepository(session)
            for entity in request.entities:
                card_type = entity.pop("card_type", None)
                if card_type == "foreshadowing":
                    entity.setdefault("status", "planted")
                    data = {k: v for k, v in entity.items() if k in ("description", "status", "planted_at_chapter_id", "resolved_at_chapter_id", "related_character_ids", "related_event_id", "reveal_type", "notes")}
                    instance = Foreshadowing(book_id=request.book_id, **data)
                    session.add(instance)
                    created.setdefault("foreshadowing", []).append({"id": instance.id})
                else:
                    data = {k: v for k, v in entity.items() if k in ("name", "description", "event_type", "chapter_id", "related_character_ids", "related_location_id", "sort_order")}
                    instance = await repo.create_timeline_event(request.book_id, data)
                    created.setdefault("timeline_events", []).append({"id": instance.id, "name": instance.name})
            await session.commit()

        elif request.step == "plot_threads":
            for entity in request.entities:
                entity.setdefault("status", "active")
                instance = PlotThread(book_id=request.book_id, **entity)
                session.add(instance)
                created.setdefault("plot_threads", []).append(entity)
            await session.commit()

        elif request.step == "outline":
            vol_repo = VolumeRepository(session)
            ch_repo = ChapterRepository(session)
            for entity in request.entities:
                card_type = entity.pop("card_type", None)
                if card_type == "volume":
                    instance = await vol_repo.create_volume(request.book_id, **entity)
                    created.setdefault("volumes", []).append({"id": instance.id, "title": instance.title})
                elif card_type == "chapter":
                    volume_id = entity.pop("volume_id", None)
                    node_data = entity.pop("nodes", [])
                    if not volume_id and created.get("volumes"):
                        volume_id = created["volumes"][-1]["id"]
                    if not volume_id:
                        continue
                    instance = await ch_repo.create_chapter(volume_id, **entity)
                    ch_id = instance.id
                    created.setdefault("chapters", []).append({"id": ch_id, "title": instance.title})
                    for node in node_data:
                        node_instance = ChapterNode(chapter_id=ch_id, **node)
                        session.add(node_instance)
                        created.setdefault("chapter_nodes", []).append({"id": node_instance.id, "title": node_instance.title})
                elif card_type == "node":
                    chapter_id = entity.pop("chapter_id", None)
                    if not chapter_id and created.get("chapters"):
                        chapter_id = created["chapters"][-1]["id"]
                    if not chapter_id:
                        continue
                    node_instance = ChapterNode(chapter_id=chapter_id, **entity)
                    session.add(node_instance)
                    created.setdefault("chapter_nodes", []).append({"id": node_instance.id, "title": node_instance.title})
            await session.commit()

        else:
            raise HTTPException(status_code=400, detail=f"未知步骤: {request.step}")

    except Exception as exc:
        await session.rollback()
        logger.exception(f"batch_create {request.step} 失败")
        raise HTTPException(status_code=500, detail=str(exc))

    return {"step": request.step, "created": created}
