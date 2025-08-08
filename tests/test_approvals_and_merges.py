import json, os, tempfile, shutil
from pipeline.steps import load_taxonomy, update_taxonomy
from pipeline.models import NewTopicCandidate, TaxonomyItem


def test_alias_merge_and_approval_flow(tmp_path):
    run_dir = tmp_path
    base = [
        {"id": "onboarding", "score": 0.8},
    ]
    new_topics = {"new_topics": [
        {"topic_id": "sso-issues", "label": "SSO Issues", "why_new": "SSO not covered", "evidence": "..."},
        {"topic_id": "onboarding-sso", "label": "Onboarding SSO", "why_new": "variant", "evidence": "..."}
    ]}
    approved = {"approved": [new_topics["new_topics"][0]]}
    merges = {"merges": [{"from": "onboarding-sso", "to": "onboarding", "score": None, "reason": "alias"}]}

    # write files to run dir
    (run_dir/"input_taxonomy.json").write_text(json.dumps(base))
    (run_dir/"new_topics.json").write_text(json.dumps(new_topics))
    (run_dir/"approved_new_topics.json").write_text(json.dumps(approved))
    (run_dir/"merges.json").write_text(json.dumps(merges))

    # simulate update_taxonomy logic directly
    base_items = [TaxonomyItem(**t) for t in base]
    cand_list = [NewTopicCandidate(**c) for c in approved["approved"]]
    updated, added = update_taxonomy(base_items, cand_list, default_score=0.5)

    # onboarding remains, sso-issues added, onboarding-sso not present
    ids = {t.id for t in updated}
    assert "onboarding" in ids
    assert "sso-issues" in ids
    assert "onboarding-sso" not in ids

