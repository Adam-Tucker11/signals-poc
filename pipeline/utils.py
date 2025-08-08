import hashlib, json, re, orjson, os
from datetime import datetime, timezone
from typing import Any, Iterable


def slugify(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return re.sub(r"-{2,}", "-", s).strip("-") or "topic"


def json_dump(obj: Any, path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(orjson.dumps(obj, option=orjson.OPT_INDENT_2))


def load_json(path: str):
    with open(path, "rb") as f:
        return orjson.loads(f.read())


def chunk_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def coalesce(*vals):
    for v in vals:
        if v is not None:
            return v
    return None


