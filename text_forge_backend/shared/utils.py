def merge_dicts(a: dict, b: dict) -> dict:
    result = a.copy()
    result.update(b)
    return result
