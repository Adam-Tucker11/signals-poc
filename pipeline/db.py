import os
from typing import List, Dict, Any, Optional
from datetime import datetime
from supabase import create_client, Client


def get_client() -> Client:
    """Get Supabase client with appropriate key."""
    url = os.environ["SUPABASE_URL"]
    # Use secret key for server-side operations (safer)
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY") or os.environ["SUPABASE_PUBLISHABLE_KEY"]
    return create_client(url, key)


# Global client instance
sb = None


def supa() -> Client:
    """Get singleton Supabase client."""
    global sb
    if sb is None:
        sb = get_client()
    return sb


# Topic operations
def upsert_topic(topic_id: str, label: str, description: str | None = None, created_by: str = "system"):
    """Create or update a topic."""
    supa().table("topics").upsert({
        "id": topic_id, 
        "label": label, 
        "description": description, 
        "created_by": created_by
    }).execute()


def add_alias(alias: str, topic_id: str):
    """Add an alias for a topic."""
    supa().table("topic_aliases").insert({
        "alias": alias, 
        "topic_id": topic_id
    }).execute()


def add_parent_child(parent_id: str, child_id: str, rollup_weight: float | None = None):
    """Add a parent-child relationship between topics."""
    supa().table("topic_relations").upsert({
        "parent_id": parent_id, 
        "child_id": child_id, 
        "relation_type": "parent_child",
        "rollup_weight": rollup_weight
    }).execute()


def get_topics() -> List[Dict[str, Any]]:
    """Get all active topics."""
    response = supa().table("topics").select("*").eq("status", "active").execute()
    return response.data


def get_topic_aliases() -> List[Dict[str, Any]]:
    """Get all topic aliases."""
    response = supa().table("topic_aliases").select("*").execute()
    return response.data


def get_topic_relations() -> List[Dict[str, Any]]:
    """Get all topic relations."""
    response = supa().table("topic_relations").select("*").execute()
    return response.data


# Candidate operations
def insert_candidates(session_id: str, candidates: List[Dict[str, Any]]):
    """Insert new topic candidates from a session."""
    rows = []
    for c in candidates:
        rows.append({
            "session_id": session_id,
            "topic_id_suggested": c.get("topic_id") or c.get("label"),
            "label": c["label"],
            "evidence": c["evidence"],
            "why_new": c.get("why_new", "")
        })
    supa().table("topic_candidates").insert(rows).execute()


def approve_candidate(candidate_id: str, topic_id: str, label: str, description: str | None = None, approver: str = "system"):
    """Approve a candidate and create the topic."""
    upsert_topic(topic_id, label, description, created_by=approver)
    supa().table("topic_candidates").update({
        "status": "approved", 
        "merged_into_topic": None, 
        "approver_id": approver, 
        "decided_at": "now()"
    }).eq("candidate_id", candidate_id).execute()


def reject_candidate(candidate_id: str, approver: str = "system"):
    """Reject a candidate."""
    supa().table("topic_candidates").update({
        "status": "rejected", 
        "approver_id": approver, 
        "decided_at": "now()"
    }).eq("candidate_id", candidate_id).execute()


def merge_candidate(candidate_id: str, alias_text: str, into_topic_id: str, approver: str = "system"):
    """Merge a candidate as an alias into an existing topic."""
    add_alias(alias_text, into_topic_id)
    supa().table("topic_candidates").update({
        "status": "merged", 
        "merged_into_topic": into_topic_id, 
        "approver_id": approver, 
        "decided_at": "now()"
    }).eq("candidate_id", candidate_id).execute()


def get_pending_candidates() -> List[Dict[str, Any]]:
    """Get all pending candidates."""
    response = supa().table("topic_candidates").select("*").eq("status", "pending").execute()
    return response.data


# Session and utterance operations
def insert_session(session_data: Dict[str, Any]) -> str:
    """Insert a new session and return its ID."""
    response = supa().table("sessions").insert(session_data).execute()
    return response.data[0]["session_id"]


def insert_speaker(speaker_data: Dict[str, Any]) -> str:
    """Insert a new speaker and return its ID."""
    response = supa().table("speakers").insert(speaker_data).execute()
    return response.data[0]["speaker_id"]


def insert_utterances(utterances: List[Dict[str, Any]]):
    """Insert multiple utterances."""
    supa().table("utterances").insert(utterances).execute()


def insert_chunks(chunks: List[Dict[str, Any]]):
    """Insert multiple chunks."""
    supa().table("chunks").insert(chunks).execute()


# Mention operations
def insert_mentions(rows: List[Dict[str, Any]]):
    """Insert mentions with required fields."""
    # rows must include: session_id, chunk_id, topic_id, evidence, created_at,
    # and optionally: surface_term, is_alias, relevance_r, importance_i, specificity_s, sentiment_tag
    supa().table("mentions").insert(rows).execute()


def get_mentions(session_id: str | None = None, topic_id: str | None = None) -> List[Dict[str, Any]]:
    """Get mentions with optional filtering."""
    query = supa().table("mentions").select("*")
    if session_id:
        query = query.eq("session_id", session_id)
    if topic_id:
        query = query.eq("topic_id", topic_id)
    response = query.execute()
    return response.data


# Scoring operations
def start_scoring_run(cfg: Dict[str, Any]) -> str:
    """Start a new scoring run and return its ID."""
    response = supa().table("scoring_runs").insert(cfg).execute()
    return response.data[0]["run_id"]


def write_topic_scores(run_id: str, scores: List[Dict[str, Any]]):
    """Write topic scores for a scoring run."""
    # each: {topic_id, direct_score, rollup_score, total_score, num_mentions, last_mention_at}
    for row in scores:
        row["run_id"] = run_id
    supa().table("topic_scores").upsert(scores).execute()


def get_latest_scores(limit: int = 50) -> List[Dict[str, Any]]:
    """Get the latest topic scores."""
    # Get the most recent scoring run
    latest_run = supa().table("scoring_runs").select("run_id").order("run_at", desc=True).limit(1).execute()
    if not latest_run.data:
        return []
    
    run_id = latest_run.data[0]["run_id"]
    
    # Get scores for that run
    response = supa().table("topic_scores").select("*").eq("run_id", run_id).order("total_score", desc=True).limit(limit).execute()
    return response.data


# Utility functions
def log_event(event_type: str, actor: str = "system", **kwargs):
    """Log an audit event."""
    payload = {k: v for k, v in kwargs.items() if v is not None}
    supa().table("events").insert({
        "event_type": event_type,
        "actor": actor,
        "payload_json": payload,
        **{k: v for k, v in kwargs.items() if k in ["session_id", "topic_id", "candidate_id", "run_id"]}
    }).execute()
