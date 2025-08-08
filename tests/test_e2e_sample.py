import orjson, os


def read_json(path: str):
    with open(path, "rb") as f:
        return orjson.loads(f.read())


def test_shapes_exist(tmp_path):
    # This is a placeholder: we won't actually call OpenAI in tests.
    # Instead, ensure repo structure is correct and data fixtures parse.
    base = read_json(os.path.abspath("data/base_taxonomy.json"))
    mtg = read_json(os.path.abspath("data/sample_meeting_01.json"))

    assert isinstance(base, list)
    assert all("id" in t for t in base)
    assert "transcript" in mtg and isinstance(mtg["transcript"], list)


