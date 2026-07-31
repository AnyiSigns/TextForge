def format_context_field(field: str, records: list, include_chapter_title: bool = True) -> str:
    if field == "book_info":
        lines = []
        for r in records:
            title = getattr(r, "title", "") or ""
            desc = getattr(r, "description", "") or ""
            genre = getattr(r, "genre", "") or ""
            lines.append(f"《{title}》类型：{genre}\n描述：{desc[:300]}")
        return "\n".join(lines)

    if field == "setting":
        lines = []
        for r in records:
            w = getattr(r, "worldview", "") or ""
            t = getattr(r, "tone", "") or ""
            wt = getattr(r, "writing_taboos", "") or ""
            cd = getattr(r, "custom_dimensions", None) or {}
            if w:
                lines.append(f"# 世界观\n{w}")
            if t:
                lines.append(f"# 文风/基调\n{t}")
            if wt:
                lines.append(f"# 创作禁忺\n{wt}")
            if cd:
                for k, v in cd.items():
                    if isinstance(v, str):
                        lines.append(f"{k}：{v}")
                    elif isinstance(v, (int, float)):
                        lines.append(f"{k}：{v}")
                    elif isinstance(v, list):
                        lines.append(f"{k}：{', '.join(str(x) for x in v)}")
                    else:
                        lines.append(f"{k}：{str(v)}")
        return "\n\n".join(lines)

    if field == "characters":
        lines = []
        for r in records:
            name = getattr(r, "name", "未知")
            desc = getattr(r, "description", "") or ""
            lines.append(f"-{name}:{desc}")
        return "角色设定\n" + "\n".join(lines)

    if field == "character_relationships":
        lines = []
        for r in records:
            name = getattr(r, "name", "未知")
            rels = getattr(r, "relationship_chain", None) or []
            rel_texts = []
            for rel in rels[:8]:
                target = getattr(rel, "target", "") or ""
                relation = getattr(rel, "relation", "") or ""
                if target and relation:
                    rel_texts.append(f"{target}（{relation}）")
            if rel_texts:
                lines.append(f"- {name}：{'；'.join(rel_texts)}")
            else:
                lines.append(f"- {name}：无关系数据")
        return "\n".join(lines)

    if field == "chapter_content":
        blocks = []
        for r in records:
            content = getattr(r, "content", "") or ""
            if include_chapter_title:
                title = getattr(r, "chapter", {}).title if hasattr(r, "chapter") else ""
                blocks.append(f"# {title}\n{content[:3000]}")
            else:
                blocks.append(content[:3000])
        return "\n\n".join(blocks)

    if field == "chapter_summaries":
        lines = []
        for r in records:
            title = getattr(r, "title", "未命名")
            summary = getattr(r, "summary", "") or ""
            lines.append(f"- {title}：{summary}")
        return "\n".join(lines)

    if field == "recent_chapters":
        blocks = []
        for r in records:
            title = getattr(r, "title", "未命名")
            summary = getattr(r, "summary", "") or ""
            content = getattr(r, "content", "") or ""
            block = f"# {title}"
            if summary:
                block += f"\n{summary}"
            if content:
                block += f"\n{content[:3000]}"
            blocks.append(block)
        return "\n\n".join(blocks)

    if field == "outline_structure":
        lines = []
        for r in records:
            node_type = getattr(r, "node_type", "")
            title = getattr(r, "title", "未命名")
            content = getattr(r, "content", "") or ""
            lines.append(f"- [{node_type}] {title}：{content[:500]}")
        return "\n".join(lines)

    if field == "volumes":
        lines = []
        for r in records:
            title = getattr(r, "title", "未命名")
            summary = getattr(r, "summary", "") or ""
            lines.append(f"- {title}：{summary[:500]}")
        return "\n".join(lines)

    return ""
