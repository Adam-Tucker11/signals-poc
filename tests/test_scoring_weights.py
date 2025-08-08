from pipeline.steps import score_mentions


def test_meeting_type_weights_affect_scores():
    mentions = [
        {"topic_id": "integrations", "meeting_type": "customer_call", "relevance": 0.8, "timestamp": "2025-08-08T00:00:00+00:00"},
        {"topic_id": "integrations", "meeting_type": "brainstorm", "relevance": 0.8, "timestamp": "2025-08-08T00:00:00+00:00"},
        {"topic_id": "listening-mode", "meeting_type": "general", "relevance": 0.9, "timestamp": "2025-08-08T00:00:00+00:00"},
    ]
    weights = {"customer_call": 1.3, "brainstorm": 0.8, "general": 1.0}
    scores = score_mentions(mentions, meeting_type_weights=weights, half_life_days=None)
    assert scores["integrations"] > scores["listening-mode"] * 0.7  # sanity: weights applied
    # increasing brainstorm weight should increase integrations score
    weights2 = {"customer_call": 1.3, "brainstorm": 1.2, "general": 1.0}
    scores2 = score_mentions(mentions, meeting_type_weights=weights2, half_life_days=None)
    assert scores2["integrations"] > scores["integrations"]

