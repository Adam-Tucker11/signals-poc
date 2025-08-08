## signals-poc

Minimal pipeline for topic detection and tagging over transcripts.

### Setup

1) Create venv and install deps

```bash
python3 -m venv .venv && source .venv/bin/activate
python -m pip install --upgrade pip
pip install openai jinja2 pydantic tenacity orjson python-dotenv
```

2) Configure env

Create a `.env` file:

```ini
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini
```

### Data fixtures

- `data/base_taxonomy.json`
- `data/sample_meeting_01.json`

### Run commands

```bash
# Flow 2: detect candidates
python run.py detect-new-topics --meeting data/sample_meeting_01.json --taxonomy data/base_taxonomy.json --out runs/demo-1

# Merge candidates into taxonomy
python run.py update-taxonomy --taxonomy data/base_taxonomy.json --candidates runs/demo-1/new_topics.json --out runs/demo-2

# Flow 1: chunk + tag → mention records
python run.py chunk-tag --meeting data/sample_meeting_01.json --taxonomy data/base_taxonomy.json --out runs/demo-3
```

Artifacts are written under `runs/<id>` as JSON.


