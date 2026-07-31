def merge_dicts(base: dict, overlay: dict) -> dict:
    result = base.copy()
    result.update(overlay)
    return result


def truncate_text(text: str, max_chars: int = 8000) -> str:
    if len(text) <= max_chars:
        return text
    return text[: max_chars // 2] + "\n...[截断]...\n" + text[-max_chars // 2 :]
