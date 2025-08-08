from __future__ import annotations
from pydantic import BaseModel, Field
from typing import List, Optional


class TaxonomyItem(BaseModel):
    id: str
    score: float = 0.0


class NewTopicCandidate(BaseModel):
    label: str
    evidence: str
    why_new: str
    topic_id: Optional[str] = None


class NewTopicResponse(BaseModel):
    new_topics: List[NewTopicCandidate] = Field(default_factory=list)


class Chunk(BaseModel):
    chunk_id: str
    speaker: str
    start_time: Optional[str] = None
    text: str


class Mention(BaseModel):
    chunk_id: str
    topic_id: Optional[str] = None
    topic_label: str
    evidence: str
    relevance: Optional[float] = None


class MentionsResponse(BaseModel):
    mentions: List[Mention] = Field(default_factory=list)


