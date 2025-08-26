#!/usr/bin/env python3
"""
Backfill script to migrate existing run data to Supabase.
"""

import json
import sys
from pathlib import Path
from typing import Dict, Any, List
from datetime import datetime

# Add the parent directory to the path so we can import pipeline modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from pipeline.db import (
    insert_session, insert_speaker, insert_utterances, insert_chunks,
    insert_candidates, insert_mentions, upsert_topic, add_alias,
    log_event
)


def load_json_file(file_path: Path) -> Dict[str, Any]:
    """Load and parse a JSON file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            return json.load(f)
    except Exception as e:
        print(f"Error loading {file_path}: {e}")
        return {}


def backfill_from_run(run_dir: Path) -> bool:
    """Backfill data from a single run directory."""
    print(f"Processing run: {run_dir.name}")
    
    # Load input data
    meeting_data = load_json_file(run_dir / "input_meeting.json")
    taxonomy_data = load_json_file(run_dir / "input_taxonomy.json")
    
    if not meeting_data:
        print(f"No meeting data found in {run_dir}")
        return False
    
    # Insert session
    session_data = {
        "title": meeting_data.get("title", f"Meeting from {run_dir.name}"),
        "meeting_type": meeting_data.get("meeting_type", "unknown"),
        "started_at": meeting_data.get("started_at"),
        "ended_at": meeting_data.get("ended_at"),
        "timezone": meeting_data.get("timezone", "UTC"),
        "meta_json": meeting_data
    }
    
    try:
        session_id = insert_session(session_data)
        print(f"Inserted session: {session_id}")
    except Exception as e:
        print(f"Error inserting session: {e}")
        return False
    
    # Insert speakers
    speaker_map = {}
    for speaker_info in meeting_data.get("speakers", []):
        speaker_data = {
            "display_name": speaker_info.get("name", "Unknown"),
            "email": speaker_info.get("email"),
            "is_internal": speaker_info.get("is_internal", False),
            "org": speaker_info.get("org"),
            "meta_json": speaker_info
        }
        
        try:
            speaker_id = insert_speaker(speaker_data)
            speaker_map[speaker_info.get("name", "Unknown")] = speaker_id
            print(f"Inserted speaker: {speaker_id} ({speaker_info.get('name', 'Unknown')})")
        except Exception as e:
            print(f"Error inserting speaker {speaker_info.get('name', 'Unknown')}: {e}")
    
    # Insert utterances
    utterances = []
    for utterance in meeting_data.get("utterances", []):
        speaker_name = utterance.get("speaker", "Unknown")
        speaker_id = speaker_map.get(speaker_name)
        
        if speaker_id:
            utterance_data = {
                "session_id": session_id,
                "speaker_id": speaker_id,
                "start_sec": utterance.get("start_sec", 0),
                "end_sec": utterance.get("end_sec"),
                "text": utterance.get("text", "")
            }
            utterances.append(utterance_data)
    
    if utterances:
        try:
            insert_utterances(utterances)
            print(f"Inserted {len(utterances)} utterances")
        except Exception as e:
            print(f"Error inserting utterances: {e}")
    
    # Insert chunks if they exist
    chunks_file = run_dir / "chunks.json"
    if chunks_file.exists():
        chunks_data = load_json_file(chunks_file)
        chunks = []
        
        for chunk in chunks_data.get("chunks", []):
            speaker_name = chunk.get("speaker", "Unknown")
            speaker_id = speaker_map.get(speaker_name)
            
            chunk_data = {
                "session_id": session_id,
                "speaker_id": speaker_id,
                "start_sec": chunk.get("start_sec"),
                "end_sec": chunk.get("end_sec"),
                "text": chunk.get("text", "")
            }
            chunks.append(chunk_data)
        
        if chunks:
            try:
                insert_chunks(chunks)
                print(f"Inserted {len(chunks)} chunks")
            except Exception as e:
                print(f"Error inserting chunks: {e}")
    
    # Insert taxonomy topics
    if taxonomy_data:
        for topic in taxonomy_data.get("topics", []):
            try:
                upsert_topic(
                    topic_id=topic.get("id", topic.get("label")),
                    label=topic.get("label", ""),
                    description=topic.get("description"),
                    created_by="backfill"
                )
                
                # Add aliases if they exist
                for alias in topic.get("aliases", []):
                    add_alias(alias, topic.get("id", topic.get("label")))
                
                print(f"Inserted topic: {topic.get('id', topic.get('label'))}")
            except Exception as e:
                print(f"Error inserting topic {topic.get('id', topic.get('label'))}: {e}")
    
    # Insert candidates if they exist
    candidates_file = run_dir / "new_topics.json"
    if candidates_file.exists():
        candidates_data = load_json_file(candidates_file)
        candidates = candidates_data.get("new_topics", [])
        
        if candidates:
            try:
                insert_candidates(session_id, candidates)
                print(f"Inserted {len(candidates)} candidates")
            except Exception as e:
                print(f"Error inserting candidates: {e}")
    
    # Insert mentions if they exist
    mentions_file = run_dir / "mentions.json"
    if mentions_file.exists():
        mentions_data = load_json_file(mentions_file)
        mentions = []
        
        for mention in mentions_data.get("mentions", []):
            mention_data = {
                "session_id": session_id,
                "chunk_id": mention.get("chunk_id"),  # This would need to be mapped to actual chunk IDs
                "topic_id": mention.get("topic_id"),
                "evidence": mention.get("evidence", ""),
                "surface_term": mention.get("surface_term"),
                "relevance_r": mention.get("relevance"),
                "created_at": meeting_data.get("started_at") or datetime.now().isoformat()
            }
            mentions.append(mention_data)
        
        if mentions:
            try:
                insert_mentions(mentions)
                print(f"Inserted {len(mentions)} mentions")
            except Exception as e:
                print(f"Error inserting mentions: {e}")
    
    # Log the backfill event
    try:
        log_event(
            event_type="backfill_completed",
            session_id=session_id,
            actor="backfill_script"
        )
    except Exception as e:
        print(f"Error logging event: {e}")
    
    return True


def main():
    """Main backfill function."""
    repo_root = Path(__file__).parent.parent
    runs_dir = repo_root / "runs"
    
    if not runs_dir.exists():
        print(f"Runs directory not found: {runs_dir}")
        return
    
    # Find all run directories
    run_dirs = [d for d in runs_dir.iterdir() if d.is_dir()]
    
    if not run_dirs:
        print("No run directories found")
        return
    
    print(f"Found {len(run_dirs)} run directories")
    
    success_count = 0
    for run_dir in run_dirs:
        if backfill_from_run(run_dir):
            success_count += 1
        print("-" * 50)
    
    print(f"Successfully processed {success_count}/{len(run_dirs)} runs")


if __name__ == "__main__":
    main()
