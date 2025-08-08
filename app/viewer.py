import json
import os
import time
import subprocess
from pathlib import Path

import streamlit as st

st.set_page_config(page_title="Signals POC Runner", layout="wide")

REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MEETING = REPO_ROOT / "data" / "sample_meeting_real.json"
DEFAULT_TAXONOMY = REPO_ROOT / "data" / "base_taxonomy.json"
RUNS_DIR = REPO_ROOT / "runs"
RUNS_DIR.mkdir(parents=True, exist_ok=True)

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

st.title("Signals POC — Upload & Run")

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

st.divider()

results_dir: Path | None = None
if go:
    out_dir = RUNS_DIR / run_name
    out_dir.mkdir(parents=True, exist_ok=True)

    # Write inputs
    meeting_path = out_dir / "input_meeting.json"
    taxonomy_path = out_dir / "input_taxonomy.json"

    if meeting_up is not None:
        save_upload(meeting_up, meeting_path)
    else:
        meeting_path.write_bytes(DEFAULT_MEETING.read_bytes())

    if tax_up is not None:
        save_upload(tax_up, taxonomy_path)
    else:
        taxonomy_path.write_bytes(DEFAULT_TAXONOMY.read_bytes())

    st.write(f"**Run dir:** `{out_dir}`")

    # Step 1: detect-new-topics
    st.subheader("Step 1: Detect New Topics")
    rc1, out1, err1 = run_cli([
        "python", str(REPO_ROOT / "run.py"),
        "detect-new-topics",
        "--meeting", str(meeting_path),
        "--taxonomy", str(taxonomy_path),
        "--out", str(out_dir),
    ])
    with st.expander("stdout (detect-new-topics)"):
        st.code(out1 or "")
    with st.expander("stderr (detect-new-topics)"):
        st.code(err1 or "")
    if rc1 != 0:
        st.error("detect-new-topics failed")
        st.stop()

    # Step 2: update-taxonomy (auto-approve optional)
    st.subheader("Step 2: Update Taxonomy")
    new_topics_file = find_first(out_dir, ["new_topics.json", "new-topics.json"]) or (out_dir / "new_topics.json")
    if auto_approve and (out_dir / "approved_new_topics.json").exists() is False:
        # copy all detected candidates into approvals
        nt = read_json(new_topics_file)
        if nt:
            (out_dir / "approved_new_topics.json").write_text(json.dumps(nt, indent=2))
            st.caption("Auto-approved all detected topics.")
    rc2, out2, err2 = run_cli([
        "python", str(REPO_ROOT / "run.py"),
        "update-taxonomy",
        "--taxonomy", str(taxonomy_path),
        "--candidates", str(new_topics_file),
        "--default-score", str(default_score),
        "--merge-threshold", str(merge_thr),
        "--out", str(out_dir),
    ])
    with st.expander("stdout (update-taxonomy)"):
        st.code(out2 or "")
    with st.expander("stderr (update-taxonomy)"):
        st.code(err2 or "")
    if rc2 != 0:
        st.error("update-taxonomy failed")
        st.stop()

    # Step 3: chunk-tag
    st.subheader("Step 3: Chunk & Tag")
    effective = out_dir / "effective_taxonomy.json"
    approved_p = out_dir / "approved_new_topics.json"
    merges_p = out_dir / "merges.json"
    tax_p = out_dir / "taxonomy_json_updated.json"
    def mtime(p: Path) -> float:
        try:
            return p.stat().st_mtime
        except Exception:
            return 0.0
    disabled_chunk = not effective.exists() or (tax_p.exists() and (mtime(tax_p) < max(mtime(approved_p), mtime(merges_p))))
    rc3, out3, err3 = (0, "", "")
    if st.button("Run Chunk & Tag", disabled=disabled_chunk):
        rc3, out3, err3 = run_cli([
        "python", str(REPO_ROOT / "run.py"),
        "chunk-tag",
        "--meeting", str(meeting_path),
            "--taxonomy", str(effective if effective.exists() else taxonomy_path),
        "--out", str(out_dir),
        ])
    with st.expander("stdout (chunk-tag)"):
        st.code(out3 or "")
    with st.expander("stderr (chunk-tag)"):
        st.code(err3 or "")
    if rc3 != 0 and (out3 or err3):
        st.error("chunk-tag failed")
    if disabled_chunk:
        st.caption("Tip: Apply approvals to taxonomy first to enable Chunk & Tag.")

    # Remember active run across reruns
    st.session_state["active_run_dir"] = str(out_dir)
    results_dir = out_dir

# If not re-running the pipeline, but we have an active run, show its results
if not results_dir and st.session_state.get("active_run_dir"):
    results_dir = Path(st.session_state["active_run_dir"]) if st.session_state.get("active_run_dir") else None

if results_dir:
    out_dir = results_dir
    # Display artifacts
    st.subheader("Results")
    t1, t2, t3, t4 = st.tabs(["New Topics", "Updated Taxonomy", "Mentions", "Scores"]) 

    with t1:
        f = find_first(out_dir, ["new_topics.json", "new-topics.json"]) 
        candidates = read_json(f) if f else None
        merges_doc = read_json(out_dir / "merge_suggestions.json") or {}
        merges_list = merges_doc.get("suggestions") if isinstance(merges_doc, dict) else []
        merge_map = {m.get("candidate"): (m.get("target"), m.get("score")) for m in (merges_list or [])}
        if not candidates:
            st.info("No new_topics.json found.")
        else:
            lst = candidates.get("new_topics") if isinstance(candidates, dict) else candidates
            if not lst:
                st.info("No candidates.")
            else:
                st.write("Approve or reject candidates. Changes are saved only when clicking Save.")

                # Load saved approvals/rejections for defaults
                approved_saved = (read_json(out_dir / "approved_new_topics.json") or {}).get("new_topics", [])
                rejected_saved = (read_json(out_dir / "rejected.json") or {}).get("new_topics", [])
                approved_ids = { (c.get("topic_id") or c.get("label")) for c in approved_saved }
                rejected_ids = { (c.get("topic_id") or c.get("label")) for c in rejected_saved }

                with st.form("approvals_form"):
                    selections = {}
                    merges_out = {}
                    for c in lst:
                        cid = (c.get("topic_id") or c.get("label"))
                        row = st.columns([3,4,4,6])
                        with row[0]:
                            st.text(cid)
                            if cid in merge_map:
                                tgt, sc = merge_map[cid]
                                st.caption(f"suggested merge→ {tgt} (score {sc:.2f})")
                        with row[1]:
                            st.caption(c.get("evidence",""))
                        with row[2]:
                            st.caption(c.get("why_new",""))
                        with row[3]:
                            key = f"cand_status::{out_dir.name}::{cid}"
                            if cid in approved_ids:
                                default = 1
                            elif cid in rejected_ids:
                                default = 2
                            else:
                                default = 0
                            choice = st.radio("Status", ["Pending", "Approve as new", "Merge into", "Reject"], index=default if default < 2 else 3, key=key, horizontal=True)
                            selections[cid] = choice
                            if choice == "Merge into":
                                # dropdown of existing ids
                                existing_ids = sorted([p.get("id") for p in (read_json(out_dir/"taxonomy_json_updated.json") or [])] or [])
                                pre = merge_map.get(cid, (None, None))[0]
                                to_id = st.selectbox("Target", ["(select)"] + existing_ids, index=(existing_ids.index(pre)+1) if pre in existing_ids else 0, key=f"merge_sel::{out_dir.name}::{cid}")
                                if to_id != "(select)":
                                    merges_out[cid] = {"to": to_id, "score": merge_map.get(cid, (None, None))[1]}

                    submitted = st.form_submit_button("Save approvals/rejections")
                    if submitted:
                        approved = [c for c in lst if selections.get((c.get("topic_id") or c.get("label"))) == "Approve as new"]
                        rejected = [c for c in lst if selections.get((c.get("topic_id") or c.get("label"))) == "Reject"]
                        merges_json = {"merges": [{"from": k, "to": v["to"], "score": v.get("score"), "reason": "alias"} for k, v in merges_out.items()]}
                        (out_dir / "approved_new_topics.json").write_text(json.dumps({"approved": approved}, indent=2))
                        (out_dir / "rejected.json").write_text(json.dumps({"rejected": [{"topic_id": (c.get("topic_id") or c.get("label")), "label": c.get("label", "")} for c in rejected]}, indent=2))
                        (out_dir / "merges.json").write_text(json.dumps(merges_json, indent=2))
                        st.success("Saved approvals and merges.")

    with t2:
        # Support multiple possible output filenames from the CLI
        f = find_first(out_dir, ["taxonomy_updated.json", "taxonomy.json", "taxonomy_json_updated.json"])
        data = read_json(f) if f else None
        if data is None:
            st.info("No updated taxonomy file found.")
        else:
            st.json(data)

        st.markdown("---")
        if st.button("Apply approvals to taxonomy", key=f"apply_tax_{out_dir.name}"):
            taxonomy_path = out_dir / "input_taxonomy.json"
            candidates_path = out_dir / "new_topics.json"  # CLI prefers approved_new_topics.json if present
            rc_u, out_u, err_u = run_cli([
                "python", str(REPO_ROOT / "run.py"),
                "update-taxonomy",
                "--taxonomy", str(taxonomy_path),
                "--candidates", str(candidates_path),
                "--default-score", str(default_score),
                "--merge-threshold", "0.85",
                "--out", str(out_dir),
            ])
            with st.expander("stdout (update-taxonomy)"):
                st.code(out_u or "")
            with st.expander("stderr (update-taxonomy)"):
                st.code(err_u or "")
            if rc_u != 0:
                st.error("update-taxonomy failed")
            else:
                f2 = find_first(out_dir, ["taxonomy_updated.json", "taxonomy.json", "taxonomy_json_updated.json"])
                st.success("Applied approvals to taxonomy.")
                if f2:
                    st.json(read_json(f2))

        # Run Chunk & Tag directly from this tab (uses effective taxonomy if present)
        st.markdown("---")
        effective_ct = out_dir / "effective_taxonomy.json"
        input_meeting = out_dir / "input_meeting.json"
        disabled_ct = not (effective_ct.exists() and input_meeting.exists())
        if st.button("Run Chunk & Tag now", key=f"chunk_now_{out_dir.name}", disabled=disabled_ct):
            rc_c, out_c, err_c = run_cli([
                "python", str(REPO_ROOT / "run.py"),
                "chunk-tag",
                "--meeting", str(input_meeting),
                "--taxonomy", str(effective_ct if effective_ct.exists() else DEFAULT_TAXONOMY),
                "--out", str(out_dir),
            ])
            with st.expander("stdout (chunk-tag)"):
                st.code(out_c or "")
            with st.expander("stderr (chunk-tag)"):
                st.code(err_c or "")
            if rc_c != 0:
                st.error("chunk-tag failed")
            else:
                st.success("Chunk & Tag completed.")
        if disabled_ct:
            st.caption("Tip: Apply approvals to create effective_taxonomy.json, then run Chunk & Tag.")

    with t3:
        f = find_first(out_dir, ["mentions.json", "chunk_mentions.json"])
        data = read_json(f) if f else None
        if data is None:
            st.info("No mentions file found.")
        else:
            st.json(data)

    with t4:
        # compute or show scores using CLI aggregator
        rc4, out4, err4 = run_cli([
            "python", str(REPO_ROOT / "run.py"),
            "score-topics",
            "--mentions", str(out_dir),
            "--out", str(out_dir)
        ])
        with st.expander("stdout (score-topics)"):
            st.code(out4 or "")
        with st.expander("stderr (score-topics)"):
            st.code(err4 or "")
        scores_path = out_dir / "topic_scores.json"
        data = read_json(scores_path)
        if not data:
            st.info("No topic_scores.json found.")
        else:
            st.json(data)

st.sidebar.markdown("---")
st.sidebar.subheader("Browse existing runs")
existing = sorted([p for p in RUNS_DIR.iterdir() if p.is_dir()], reverse=True)
sel = st.sidebar.selectbox("Pick a run to view", [""] + [p.name for p in existing])

if sel:
    out_dir = RUNS_DIR / sel
    st.write(f"**Viewing:** `{out_dir}`")
    t1, t2, t3, t4 = st.tabs(["New Topics", "Updated Taxonomy", "Mentions", "Scores"]) 
    with t1:
        f = find_first(out_dir, ["new_topics.json", "new-topics.json"])
        st.json(read_json(f) if f else {"_info": "not found"})
    with t2:
        f = find_first(out_dir, ["taxonomy_updated.json", "taxonomy.json", "taxonomy_json_updated.json"])
        st.json(read_json(f) if f else {"_info": "not found"})
    with t3:
        f = find_first(out_dir, ["mentions.json", "chunk_mentions.json"])
        st.json(read_json(f) if f else {"_info": "not found"})
    with t4:
        scores_path = out_dir / "topic_scores.json"
        st.json(read_json(scores_path) if scores_path.exists() else {"_info": "not found"})


