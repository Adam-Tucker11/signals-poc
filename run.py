import argparse, os, uuid
from pathlib import Path
from pipeline.steps import (
    load_meeting, load_taxonomy, naive_chunks,
    detect_new_topics, chunk_and_tag,
    update_taxonomy, create_mention_records,
    write_artifacts
)
from pipeline.models import NewTopicCandidate
from pipeline.utils import slugify


def cmd_detect(args):
    meeting = load_meeting(args.meeting)
    taxonomy = load_taxonomy(args.taxonomy)
    out = detect_new_topics(meeting, taxonomy)
    run_dir = args.out or f"runs/{uuid.uuid4().hex}"
    write_artifacts(run_dir, new_topics=out.model_dump())
    print(f"✔ wrote {run_dir}/new_topics.json")


def cmd_chunk_tag(args):
    meeting = load_meeting(args.meeting)
    # Prefer effective taxonomy in the target run dir if available
    tax_path = args.taxonomy
    run_dir_guess = Path(args.out) if args.out else Path(".")
    eff = run_dir_guess / "effective_taxonomy.json"
    upd = run_dir_guess / "taxonomy_json_updated.json"
    if not tax_path:
        if eff.exists():
            tax_path = str(eff)
            print(f"ℹ using effective taxonomy: {tax_path}")
        elif upd.exists():
            tax_path = str(upd)
            print(f"ℹ using updated taxonomy (no approvals yet): {tax_path}")
        else:
            tax_path = "data/base_taxonomy.json"
            print(f"⚠ no run taxonomy found; falling back to {tax_path}")
    taxonomy = load_taxonomy(tax_path)
    chunks = naive_chunks(meeting)
    mentions_resp = chunk_and_tag(meeting, taxonomy, chunks)
    recs = create_mention_records(
        meeting, chunks, [m for m in mentions_resp.mentions]
    )
    run_dir = args.out or f"runs/{uuid.uuid4().hex}"
    write_artifacts(
        run_dir,
        chunks=[c.model_dump() for c in chunks],
        mentions=mentions_resp.model_dump(),
        mention_records=recs
    )
    print(f"✔ wrote {run_dir}/chunks.json, mentions.json, mention_records.json")


def cmd_update_taxonomy(args):
    import orjson, os
    from pipeline.steps import suggest_merges, suggest_merges_debug
    base = load_taxonomy(args.taxonomy)
    if args.candidates.endswith(".json"):
        cand = orjson.loads(open(args.candidates,"rb").read())
        lst = cand["new_topics"] if "new_topics" in cand else cand
        # If approved file co-exists in same dir, prefer it
        try:
            approved_path = os.path.join(os.path.dirname(args.candidates), "approved_new_topics.json")
            if os.path.exists(approved_path):
                appr = orjson.loads(open(approved_path, "rb").read())
                lst = appr.get("new_topics", lst)
        except Exception:
            pass
    else:
        raise SystemExit("pass --candidates <path to new_topics.json>")
    candidates = [NewTopicCandidate(**c) for c in lst]
    merges = []
    if args.merge_threshold is not None:
        try:
            merges = suggest_merges(base, candidates, threshold=float(args.merge_threshold))
        except Exception as e:
            merges = []
    merge_debug = {}
    try:
        merge_debug = suggest_merges_debug(base, candidates)
    except Exception:
        merge_debug = {}
    # Apply user merges (alias) only if merges.json exists; suggestions are hints only
    user_merges_path = os.path.join(os.path.dirname(args.candidates), "merges.json")
    alias_map = {}
    if os.path.exists(user_merges_path):
        try:
            import orjson
            mj = orjson.loads(open(user_merges_path, "rb").read())
            for m in (mj.get("merges") or []):
                alias_map[slugify(m.get("from"))] = slugify(m.get("to"))
        except Exception:
            alias_map = {}
    if alias_map:
        candidates = [c for c in candidates if slugify(getattr(c, 'topic_id', None) or c.label) not in alias_map]
    updated, added = update_taxonomy(base, candidates, default_score=args.default_score)
    run_dir = args.out or f"runs/{uuid.uuid4().hex}"
    write_artifacts(
        run_dir,
        taxonomy_json_updated=[t.model_dump() for t in updated],
        added_topic_ids=added,
        merge_suggestions={"suggestions": merges},
        num_topics=len(updated),
        effective_taxonomy=[t.model_dump() for t in updated]
    )
    # Write separate debug and suggestions artifacts for clarity
    try:
        import orjson
        open(os.path.join(run_dir, "merge_suggestions.json"), "wb").write(orjson.dumps({"suggestions": merges}))
        open(os.path.join(run_dir, "merge_debug.json"), "wb").write(orjson.dumps(merge_debug))
    except Exception:
        pass
    print(f"✔ wrote {run_dir}/taxonomy_json_updated.json")


def cmd_score_topics(args):
    import glob, json
    from pipeline.steps import score_mentions

    paths = []
    if os.path.isdir(args.mentions):
        # Prefer mention_records.json; fallback to mentions.json
        paths = (
            glob.glob(os.path.join(args.mentions, "**", "mention_records.json"), recursive=True)
            + glob.glob(os.path.join(args.mentions, "**", "mentions.json"), recursive=True)
        )
    else:
        paths = [args.mentions]

    all_mentions = []
    for pth in paths:
        try:
            with open(pth, "r", encoding="utf-8") as f:
                obj = json.load(f)
                if isinstance(obj, dict):
                    if "mention_records" in obj and isinstance(obj["mention_records"], list):
                        all_mentions.extend(obj["mention_records"])
                    elif "mentions" in obj and isinstance(obj["mentions"], list):
                        all_mentions.extend(obj["mentions"])
                elif isinstance(obj, list):
                    all_mentions.extend(obj)
        except Exception:
            continue

    # Parse meeting type weights JSON if provided
    mtw = {}
    try:
        if getattr(args, 'meeting_type_weights', None):
            mtw = json.loads(args.meeting_type_weights)
    except Exception:
        mtw = {}

    # half_life_days None means no decay
    hld = args.half_life_days
    if hld is not None and hld <= 0:
        hld = None

    scores = score_mentions(all_mentions, meeting_type_weights=mtw or None, half_life_days=(hld if hld else 7.0))
    run_dir = args.out or f"runs/{uuid.uuid4().hex}"
    os.makedirs(run_dir, exist_ok=True)
    with open(os.path.join(run_dir, "topic_scores.json"), "w", encoding="utf-8") as f:
        json.dump({"scores": [{"topic_id": k, "score": v} for k, v in sorted(scores.items(), key=lambda kv: -kv[1])],
                   "meta": {"half_life_days": hld if hld else 7.0, "meeting_type_weights": mtw}}, f, indent=2)
    print(f"✔ wrote {os.path.join(run_dir, 'topic_scores.json')}")


def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)

    d = sub.add_parser("detect-new-topics")
    d.add_argument("--meeting", required=True)
    d.add_argument("--taxonomy", required=True)
    d.add_argument("--out", default=None)
    d.set_defaults(func=cmd_detect)

    c = sub.add_parser("chunk-tag")
    c.add_argument("--meeting", required=True)
    c.add_argument("--taxonomy", required=False)
    c.add_argument("--out", default=None)
    c.set_defaults(func=cmd_chunk_tag)

    u = sub.add_parser("update-taxonomy")
    u.add_argument("--taxonomy", required=True)
    u.add_argument("--candidates", required=True)
    u.add_argument("--default-score", type=float, default=0.5)
    u.add_argument("--merge-threshold", type=float, default=None, help="Cosine threshold for merge suggestions (e.g., 0.85)")
    u.add_argument("--out", default=None)
    u.set_defaults(func=cmd_update_taxonomy)

    s = sub.add_parser("score-topics")
    s.add_argument("--mentions", required=True)
    s.add_argument("--out", default=None)
    s.add_argument("--half-life-days", type=float, default=7.0)
    s.add_argument("--meeting-type-weights", dest="meeting_type_weights", default=None)
    s.set_defaults(func=cmd_score_topics)

    args = p.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()


