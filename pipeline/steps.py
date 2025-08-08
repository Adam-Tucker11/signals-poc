from __future__ import annotations
import os
from typing import List, Dict, Any, Tuple, Optional
from pydantic import BaseModel
from .models import (
    TaxonomyItem, Chunk, Mention, MentionsResponse,
    NewTopicResponse, NewTopicCandidate
)
from .utils import slugify, json_dump, chunk_hash, utc_now_iso, load_json
from .llm import render, call_and_validate, embed_texts


# ---------- Schemas for LLM structured output ----------
NEW_TOPICS_SCHEMA = {
  "type": "object",
  "properties": {
    "new_topics": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["label","evidence","why_new"],
        "additionalProperties": False,
        "properties": {
          "label": {"type":"string"},
          "topic_id": {"type":"string"},
          "evidence": {"type":"string"},
          "why_new": {"type":"string"}
        }
      }
    }
  },
  "required": ["new_topics"],
  "additionalProperties": False
}

MENTIONS_SCHEMA = {
  "type": "object",
  "properties": {
    "mentions": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["chunk_id","topic_label","evidence"],
        "additionalProperties": False,
        "properties": {
          "chunk_id": {"type":"string"},
          "topic_id": {"type":"string"},
          "topic_label": {"type":"string"},
          "evidence": {"type":"string"},
          "relevance": {"type":"number"}
        }
      }
    }
  },
  "required": ["mentions"],
  "additionalProperties": False
}


# ---------- Pure helpers ----------

def load_meeting(path: str) -> Dict[str, Any]:
    return load_json(path)


def load_taxonomy(path: str) -> List[TaxonomyItem]:
    raw = load_json(path)
    if isinstance(raw, dict) and "taxonomy_json_updated" in raw:
        raw = raw["taxonomy_json_updated"]
    return [TaxonomyItem(**t) for t in raw]


def naive_chunks(meeting: Dict[str,Any]) -> List[Chunk]:
    """Create chunks from meeting transcript.

    Supports both structured transcripts (list of {speaker,text,...}) and
    flat string transcripts (single large text) or list[str].
    """
    out: List[Chunk] = []
    tr = meeting.get("transcript", "")
    if isinstance(tr, str):
        text = tr.strip()
        if text:
            out.append(Chunk(
                chunk_id=f"{1:08x}"[:8],
                speaker="unknown",
                start_time=meeting.get("start_time"),
                text=text
            ))
        return out

    if isinstance(tr, list):
        for i, row in enumerate(tr, start=1):
            if isinstance(row, dict):
                out.append(Chunk(
                    chunk_id=f"{i:08x}"[:8],
                    speaker=row.get("speaker","unknown"),
                    start_time=row.get("start_time"),
                    text=str(row.get("text",""))[:100000].strip()
                ))
            else:
                # treat as plain text element
                out.append(Chunk(
                    chunk_id=f"{i:08x}"[:8],
                    speaker="unknown",
                    start_time=None,
                    text=str(row).strip()
                ))
        return out

    # Fallback: nothing usable
    return out


# ---------- LLM steps ----------

def _transcript_to_text(meeting: Dict[str, Any]) -> str:
    tr = meeting.get("transcript", "")
    if isinstance(tr, str):
        return tr
    if isinstance(tr, list):
        # list of dicts or strings
        parts: List[str] = []
        for row in tr:
            if isinstance(row, dict):
                parts.append(str(row.get("text", "")))
            else:
                parts.append(str(row))
        return "\n".join(p for p in parts if p)
    return ""


def detect_new_topics(meeting: Dict[str,Any], taxonomy: List[TaxonomyItem]) -> NewTopicResponse:
    user = render(
        "detect_new_topics.j2",
        meeting_title=meeting.get("meeting_title",""),
        meeting_type=meeting.get("meeting_type",""),
        taxonomy_ids=[t.id for t in taxonomy],
        transcript_text=_transcript_to_text(meeting)
    )
    system = "Return only valid JSON. Do not include existing taxonomy ids as new."
    resp = call_and_validate(system, user, "NewTopicDetection", NEW_TOPICS_SCHEMA, NewTopicResponse)
    # Ensure topic_id is present for all candidates
    for c in resp.new_topics:
        if not getattr(c, "topic_id", None):
            c.topic_id = slugify(c.label)
        else:
            c.topic_id = slugify(c.topic_id)
    return resp


def chunk_and_tag(meeting: Dict[str,Any], taxonomy: List[TaxonomyItem], chunks: List[Chunk]) -> MentionsResponse:
    user = render(
        "chunk_tag.j2",
        taxonomy_ids=[t.id for t in taxonomy],
        chunks_json=[c.model_dump() for c in chunks]
    )
    system = "Return only mentions whose topic_label exactly matches an existing taxonomy id."
    return call_and_validate(system, user, "ChunkTagging", MENTIONS_SCHEMA, MentionsResponse)


# ---------- Transform steps ----------

def update_taxonomy(base: List[TaxonomyItem], candidates: List[NewTopicCandidate], default_score: float = 0.5
                   ) -> Tuple[List[TaxonomyItem], List[str]]:
    existing = {t.id for t in base}
    updated = list(base)
    added: List[str] = []
    for c in candidates:
        tid = slugify(getattr(c, 'topic_id', None) or c.label)
        if tid not in existing:
            updated.append(TaxonomyItem(id=tid, score=default_score))
            existing.add(tid)
            added.append(tid)
    return updated, added


def suggest_merges(
    base: List[TaxonomyItem],
    candidates: List[NewTopicCandidate],
    *,
    base_gloss_map: Dict[str, str] | None = None,
    threshold: float = 0.85,
) -> List[Dict[str, Any]]:
    """Suggest merges for near-duplicate topics using embeddings.

    Returns a list of {candidate, target, score} for merges when cosine >= threshold.
    base_gloss_map can provide short text per existing topic id to embed (e.g., description).
    """
    import math

    if not candidates or not base:
        return []

    base_ids = [t.id for t in base]
    base_texts = [
        f"{tid} - {base_gloss_map.get(tid, '') if base_gloss_map else ''}".strip()
        for tid in base_ids
    ]
    cand_ids = [slugify(getattr(c, 'topic_id', None) or c.label) for c in candidates]
    cand_texts = [
        f"{cid} - {(c.why_new or '')} | {(c.evidence or '')}".strip()
        for cid, c in zip(cand_ids, candidates)
    ]

    base_vecs = embed_texts(base_texts)
    cand_vecs = embed_texts(cand_texts)

    def cosine(a, b):
        dot = sum(x*y for x, y in zip(a, b))
        na = math.sqrt(sum(x*x for x in a)) or 1.0
        nb = math.sqrt(sum(y*y for y in b)) or 1.0
        return dot / (na * nb)

    merges_list: List[Dict[str, Any]] = []
    # Heuristic: exact id match -> merge
    base_set = set(base_ids)
    for cid in cand_ids:
        if cid in base_set:
            merges_list.append({"candidate": cid, "target": cid, "score": 1.0})

    for i, cv in enumerate(cand_vecs):
        best = -1.0
        best_tid = None
        for j, bv in enumerate(base_vecs):
            score = cosine(cv, bv)
            if score > best:
                best = score
                best_tid = base_ids[j]
        if best >= threshold and best_tid and all(m["candidate"] != cand_ids[i] for m in merges_list):
            merges_list.append({"candidate": cand_ids[i], "target": best_tid, "score": float(best)})
    return merges_list


def suggest_merges_debug(
    base: List[TaxonomyItem],
    candidates: List[NewTopicCandidate],
    *,
    base_gloss_map: Dict[str, str] | None = None,
) -> Dict[str, Dict[str, Any]]:
    """Return per-candidate best match and cosine score for debugging.

    Shape: { candidate_id: {"best_id": <base_id>, "score": <float>} }
    """
    import math
    if not candidates or not base:
        return {}

    base_ids = [t.id for t in base]
    base_texts = [
        f"{tid} - {base_gloss_map.get(tid, '') if base_gloss_map else ''}".strip()
        for tid in base_ids
    ]
    cand_ids = [slugify(getattr(c, 'topic_id', None) or c.label) for c in candidates]
    cand_texts = [
        f"{cid} - {(c.why_new or '')} | {(c.evidence or '')}".strip()
        for cid, c in zip(cand_ids, candidates)
    ]

    base_vecs = embed_texts(base_texts)
    cand_vecs = embed_texts(cand_texts)

    def cosine(a, b):
        dot = sum(x*y for x, y in zip(a, b))
        na = math.sqrt(sum(x*x for x in a)) or 1.0
        nb = math.sqrt(sum(y*y for y in b)) or 1.0
        return dot / (na * nb)

    dbg: Dict[str, Dict[str, Any]] = {}
    for i, cv in enumerate(cand_vecs):
        best = -1.0
        best_tid = None
        for j, bv in enumerate(base_vecs):
            score = cosine(cv, bv)
            if score > best:
                best = score
                best_tid = base_ids[j]
        dbg[cand_ids[i]] = {"best_id": best_tid, "score": float(best)}
    return dbg


# ---------- Scoring ----------
from datetime import datetime, timezone
from collections import defaultdict


def score_mentions(
    mentions: List[Dict[str, Any]],
    *,
    speaker_weights: Dict[str, float] | None = None,
    meeting_type_weights: Dict[str, float] | None = None,
    half_life_days: Optional[float] = None,
    now: datetime | None = None,
) -> Dict[str, float]:
    """Aggregate mention-like dicts to per-topic scores with exponential decay.

    Each mention should contain: topic_id or topic_label, speaker_role, meeting_type, timestamp, relevance.
    Missing fields are defaulted conservatively.
    """
    if not mentions:
        return {}

    speaker_weights = speaker_weights or {
        "customer": 1.5,
        "pm": 1.2,
        "engineer": 1.1,
        "unknown": 1.0,
    }
    meeting_type_weights = meeting_type_weights or {
        "customer_call": 1.3,
        "refinement": 1.2,
        "brainstorm": 0.9,
        "internal": 1.0,
        "unknown": 1.0,
    }

    now = now or datetime.now(timezone.utc)
    # Decay base such that score halves every half_life_days; if None, no decay
    per_day_decay = None if (half_life_days is None) else (0.5 ** (1.0 / max(1e-6, half_life_days)))

    totals: Dict[str, float] = defaultdict(float)
    for m in mentions:
        tid = m.get("topic_id") or m.get("topic_label")
        if not tid:
            continue
        role = str(m.get("speaker_role") or "unknown").lower()
        mtype = str(m.get("meeting_type") or "unknown").lower()
        w_speaker = float(speaker_weights.get(role, 1.0))
        w_meeting = float(meeting_type_weights.get(mtype, 1.0))
        rel = float(m.get("relevance", 1.0) or 1.0)

        ts = m.get("timestamp")
        try:
            when = datetime.fromisoformat(ts) if ts else now
        except Exception:
            when = now
        days = max(0.0, (now - when).total_seconds() / 86400.0)
        decay = 1.0 if per_day_decay is None else (per_day_decay ** days)

        totals[slugify(tid)] += rel * w_speaker * w_meeting * decay

    return dict(totals)


def create_mention_records(
    meeting: Dict[str,Any],
    chunks: List[Chunk],
    mentions: List[Mention]
) -> Dict[str,Any]:
    meeting_id = meeting["meeting_id"]
    meeting_type = meeting.get("meeting_type","")
    now_iso = utc_now_iso()
    chunk_map = {c.chunk_id: c for c in chunks}

    records = []
    for m in mentions:
        ch = chunk_map.get(m.chunk_id)
        if not ch: 
            continue
        records.append({
            "meeting_id": meeting_id,
            "chunk_hash": chunk_hash(ch.text),
            "topic_id": getattr(m, 'topic_id', None) or m.topic_label,
            "speaker_role": ch.speaker or "unknown",
            "meeting_type": meeting_type,
            "relevance": float(m.relevance) if getattr(m, 'relevance', None) is not None else 1.0,
            "timestamp": now_iso
        })
    return {"mention_records": records, "num_records": len(records)}


# ---------- Runner helpers (write artifacts) ----------

def write_artifacts(run_dir: str, **files):
    os.makedirs(run_dir, exist_ok=True)
    for name, obj in files.items():
        json_dump(obj, os.path.join(run_dir, f"{name}.json"))


