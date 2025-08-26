import json
import os
import time
import subprocess
from pathlib import Path
from typing import Dict, Any, List

import streamlit as st
import pandas as pd

# Add the parent directory to the path so we can import pipeline modules
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from pipeline.db import (
    get_topics, get_topic_aliases, get_topic_relations, get_pending_candidates,
    approve_candidate, reject_candidate, merge_candidate, get_mentions,
    get_latest_scores, start_scoring_run, write_topic_scores,
    insert_session, insert_speaker, insert_utterances, insert_chunks,
    insert_candidates, insert_mentions, upsert_topic, add_alias
)

st.set_page_config(page_title="Signals POC - Supabase", layout="wide")

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MEETING = REPO_ROOT / "data" / "sample_meeting_real.json"
DEFAULT_TAXONOMY = REPO_ROOT / "data" / "base_taxonomy.json"

# Persist currently active run dir across reruns so UI doesn't collapse
if "active_run_dir" not in st.session_state:
    st.session_state["active_run_dir"] = None


def save_upload(uploaded_file, path: Path):
    path.write_bytes(uploaded_file.getbuffer())


def run_cli(args):
    """Run our existing CLI so we don't reimplement pipeline logic here."""
    proc = subprocess.run(args, capture_output=True, text=True)
    return proc.returncode, proc.stdout, proc.stderr


def read_json(path: Path):
    if not path.exists():
        return None
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        return {"_error": f"Failed to read {path.name}: {e}"}


def find_first(out_dir: Path, candidates):
    for name in candidates:
        p = out_dir / name
        if p.exists():
            return p
    return None


# Sidebar configuration
st.sidebar.header("Config")
api_key = st.sidebar.text_input("OPENAI_API_KEY", type="password", help="Needed for LLM steps")
model = st.sidebar.text_input("OPENAI_MODEL", value=os.environ.get("OPENAI_MODEL", "gpt-4o-mini"))
use_sample = st.sidebar.checkbox("Use sample inputs", value=True, help="Use data/sample_meeting_real.json and data/base_taxonomy.json")
default_score = st.sidebar.slider(
    "Default score for new topics", min_value=0.1, max_value=1.0, value=0.5, step=0.05
)
auto_approve = st.sidebar.checkbox("Auto-approve new topics", value=False, help="Use all detected candidates without manual review.")
merge_thr = st.sidebar.slider("Merge threshold", 0.0, 1.0, 0.50, 0.01)

if api_key:
    os.environ["OPENAI_API_KEY"] = api_key
if model:
    os.environ["OPENAI_MODEL"] = model

# Main app
st.title("Signals POC — Supabase Backend")

# Tab navigation
tab1, tab2, tab3, tab4, tab5 = st.tabs(["Pipeline", "New Topics", "Taxonomy", "Mentions", "Scores"])

with tab1:
    st.header("Run Pipeline")
    
    col1, col2 = st.columns(2)
    with col1:
        meeting_up = st.file_uploader("Meeting transcript JSON", type=["json"], key="meeting_json")
        if use_sample and meeting_up is None:
            st.caption(f"Using sample: {DEFAULT_MEETING}")
    with col2:
        tax_up = st.file_uploader("Taxonomy JSON (optional)", type=["json"], key="taxonomy_json")
        if use_sample and tax_up is None:
            st.caption(f"Using sample: {DEFAULT_TAXONOMY}")

    run_name = st.text_input("Run name", value=time.strftime("run-%Y%m%d-%H%M%S"))
    go = st.button("Run pipeline")

    if go:
        # Create temporary directory for the run
        temp_dir = Path(f"/tmp/signals_run_{run_name}")
        temp_dir.mkdir(parents=True, exist_ok=True)

        # Write inputs
        meeting_path = temp_dir / "input_meeting.json"
        taxonomy_path = temp_dir / "input_taxonomy.json"

        if meeting_up is not None:
            save_upload(meeting_up, meeting_path)
        else:
            meeting_path.write_bytes(DEFAULT_MEETING.read_bytes())

        if tax_up is not None:
            save_upload(tax_up, taxonomy_path)
        else:
            taxonomy_path.write_bytes(DEFAULT_TAXONOMY.read_bytes())

        # Run the pipeline
        with st.spinner("Running pipeline..."):
            returncode, stdout, stderr = run_cli([
                "python", "run.py",
                "--meeting", str(meeting_path),
                "--taxonomy", str(taxonomy_path),
                "--out-dir", str(temp_dir),
                "--auto-approve" if auto_approve else "",
                "--merge-threshold", str(merge_thr)
            ])

        if returncode == 0:
            st.success("Pipeline completed successfully!")
            
            # Load results and insert into Supabase
            meeting_data = read_json(meeting_path)
            taxonomy_data = read_json(taxonomy_path)
            
            if meeting_data:
                # Insert session
                session_data = {
                    "title": meeting_data.get("title", f"Meeting from {run_name}"),
                    "meeting_type": meeting_data.get("meeting_type", "unknown"),
                    "started_at": meeting_data.get("started_at"),
                    "ended_at": meeting_data.get("ended_at"),
                    "timezone": meeting_data.get("timezone", "UTC"),
                    "meta_json": meeting_data
                }
                
                session_id = insert_session(session_data)
                st.info(f"Session created: {session_id}")
                
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
                    speaker_id = insert_speaker(speaker_data)
                    speaker_map[speaker_info.get("name", "Unknown")] = speaker_id
                
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
                    insert_utterances(utterances)
                    st.info(f"Inserted {len(utterances)} utterances")
                
                # Insert taxonomy topics
                if taxonomy_data:
                    for topic in taxonomy_data.get("topics", []):
                        upsert_topic(
                            topic_id=topic.get("id", topic.get("label")),
                            label=topic.get("label", ""),
                            description=topic.get("description"),
                            created_by="pipeline"
                        )
                        for alias in topic.get("aliases", []):
                            add_alias(alias, topic.get("id", topic.get("label")))
                
                # Insert candidates if they exist
                candidates_file = temp_dir / "new_topics.json"
                if candidates_file.exists():
                    candidates_data = read_json(candidates_file)
                    candidates = candidates_data.get("new_topics", [])
                    if candidates:
                        insert_candidates(session_id, candidates)
                        st.info(f"Inserted {len(candidates)} candidates")
                
                # Insert mentions if they exist
                mentions_file = temp_dir / "mentions.json"
                if mentions_file.exists():
                    mentions_data = read_json(mentions_file)
                    mentions = mentions_data.get("mentions", [])
                    if mentions:
                        # Convert mentions to database format
                        db_mentions = []
                        for mention in mentions:
                            mention_data = {
                                "session_id": session_id,
                                "chunk_id": mention.get("chunk_id"),  # Would need proper mapping
                                "topic_id": mention.get("topic_id"),
                                "evidence": mention.get("evidence", ""),
                                "surface_term": mention.get("surface_term"),
                                "relevance_r": mention.get("relevance"),
                                "created_at": meeting_data.get("started_at") or time.strftime("%Y-%m-%dT%H:%M:%S")
                            }
                            db_mentions.append(mention_data)
                        
                        insert_mentions(db_mentions)
                        st.info(f"Inserted {len(db_mentions)} mentions")
        else:
            st.error(f"Pipeline failed with return code {returncode}")
            st.text("STDOUT:")
            st.code(stdout)
            st.text("STDERR:")
            st.code(stderr)

with tab2:
    st.header("New Topic Candidates")
    
    candidates = get_pending_candidates()
    
    if not candidates:
        st.info("No pending candidates found.")
    else:
        st.write(f"Found {len(candidates)} pending candidates")
        
        for candidate in candidates:
            with st.expander(f"**{candidate['label']}** - {candidate['topic_id_suggested']}"):
                col1, col2 = st.columns([2, 1])
                
                with col1:
                    st.write(f"**Evidence:** {candidate['evidence']}")
                    if candidate.get('why_new'):
                        st.write(f"**Why new:** {candidate['why_new']}")
                    st.write(f"**Session:** {candidate['session_id']}")
                    st.write(f"**Created:** {candidate['created_at']}")
                
                with col2:
                    st.write("**Actions:**")
                    
                    # Approve button
                    if st.button("Approve", key=f"approve_{candidate['candidate_id']}"):
                        approve_candidate(
                            candidate['candidate_id'],
                            candidate['topic_id_suggested'],
                            candidate['label']
                        )
                        st.success("Candidate approved!")
                        st.rerun()
                    
                    # Reject button
                    if st.button("Reject", key=f"reject_{candidate['candidate_id']}"):
                        reject_candidate(candidate['candidate_id'])
                        st.success("Candidate rejected!")
                        st.rerun()
                    
                    # Merge option
                    st.write("**Merge into:**")
                    topics = get_topics()
                    topic_options = {t['label']: t['id'] for t in topics}
                    
                    if topic_options:
                        selected_topic = st.selectbox(
                            "Select topic to merge into:",
                            options=list(topic_options.keys()),
                            key=f"merge_{candidate['candidate_id']}"
                        )
                        
                        if st.button("Merge", key=f"merge_btn_{candidate['candidate_id']}"):
                            merge_candidate(
                                candidate['candidate_id'],
                                candidate['label'],
                                topic_options[selected_topic]
                            )
                            st.success("Candidate merged!")
                            st.rerun()

with tab3:
    st.header("Taxonomy Management")
    
    # Topics
    st.subheader("Topics")
    topics = get_topics()
    
    if topics:
        topics_df = pd.DataFrame(topics)
        st.dataframe(topics_df[['id', 'label', 'description', 'created_at']], use_container_width=True)
    else:
        st.info("No topics found.")
    
    # Aliases
    st.subheader("Topic Aliases")
    aliases = get_topic_aliases()
    
    if aliases:
        aliases_df = pd.DataFrame(aliases)
        st.dataframe(aliases_df[['alias', 'topic_id', 'created_at']], use_container_width=True)
    else:
        st.info("No aliases found.")
    
    # Relations
    st.subheader("Topic Relations")
    relations = get_topic_relations()
    
    if relations:
        relations_df = pd.DataFrame(relations)
        st.dataframe(relations_df, use_container_width=True)
    else:
        st.info("No relations found.")

with tab4:
    st.header("Mentions")
    
    # Filter options
    col1, col2 = st.columns(2)
    with col1:
        session_filter = st.text_input("Filter by Session ID (optional)")
    with col2:
        topic_filter = st.text_input("Filter by Topic ID (optional)")
    
    mentions = get_mentions(
        session_id=session_filter if session_filter else None,
        topic_id=topic_filter if topic_filter else None
    )
    
    if mentions:
        mentions_df = pd.DataFrame(mentions)
        st.dataframe(mentions_df, use_container_width=True)
    else:
        st.info("No mentions found.")

with tab5:
    st.header("Topic Scores")
    
    # Scoring configuration
    st.subheader("Scoring Configuration")
    col1, col2, col3 = st.columns(3)
    
    with col1:
        half_life = st.slider("Half-life (days)", 1.0, 100.0, 21.0, 1.0)
    with col2:
        min_relevance = st.slider("Min relevance", 0.0, 1.0, 0.35, 0.05)
    with col3:
        rollup_alpha = st.slider("Rollup alpha", 0.0, 1.0, 0.40, 0.05)
    
    if st.button("Run Scoring"):
        with st.spinner("Running scoring..."):
            # Start scoring run
            run_config = {
                "run_type": "interactive",
                "half_life_days": half_life,
                "min_relevance": min_relevance,
                "default_rollup_alpha": rollup_alpha,
                "include_sentiment": True,
                "include_action": False,
                "notes": "Manual scoring run from Streamlit"
            }
            
            run_id = start_scoring_run(run_config)
            st.success(f"Scoring run started: {run_id}")
            
            # TODO: Actually run the scoring algorithm here
            # For now, just show a placeholder
            st.info("Scoring algorithm integration pending...")
    
    # Show latest scores
    st.subheader("Latest Scores")
    scores = get_latest_scores()
    
    if scores:
        scores_df = pd.DataFrame(scores)
        st.dataframe(scores_df, use_container_width=True)
    else:
        st.info("No scores found.")
