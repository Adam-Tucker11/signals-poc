import os, orjson
from tenacity import retry, stop_after_attempt, wait_exponential
from jinja2 import Environment, FileSystemLoader, select_autoescape
from pydantic import BaseModel, ValidationError
from typing import Any, Dict, Type, List
from openai import OpenAI


env = Environment(
    loader=FileSystemLoader("prompts"),
    autoescape=select_autoescape(disabled_extensions=("j2",))
)

MODEL = os.environ.get("OPENAI_MODEL", "gpt-4o-mini")
EMBED_MODEL = os.environ.get("OPENAI_EMBED_MODEL", "text-embedding-3-small")

_client = None


def get_openai_client() -> OpenAI:
    global _client
    if _client is not None:
        return _client
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        # Lazy error so imports work without creds
        raise RuntimeError("OPENAI_API_KEY is not set; required for LLM calls.")
    _client = OpenAI(api_key=api_key)
    return _client


def render(template_name: str, **vars) -> str:
    return env.get_template(template_name).render(**vars)


def schema_wrapper(schema_name: str, schema: Dict[str, Any]) -> Dict[str, Any]:
    # OpenAI JSON Schema response format
    return {
        "type": "json_schema",
        "json_schema": {
            "name": schema_name,
            "schema": schema
        }
    }


@retry(stop=stop_after_attempt(3), wait=wait_exponential(min=1, max=8))
def call_json(
    system_prompt: str,
    user_prompt: str,
    schema_name: str,
    schema: Dict[str, Any],
) -> Dict[str, Any]:
    client = get_openai_client()
    resp = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        response_format=schema_wrapper(schema_name, schema),
        temperature=0.2,
        top_p=1
    )
    content = resp.choices[0].message.content
    return orjson.loads(content)


def call_and_validate(
    system: str,
    user: str,
    schema_name: str,
    schema: Dict[str, Any],
    model_cls: Type[BaseModel]
) -> BaseModel:
    data = call_json(system, user, schema_name, schema)
    try:
        return model_cls.model_validate(data)
    except ValidationError as e:
        # One retry via a looser parse: if assistant wrapped in {"content": "...json..."}
        if isinstance(data, dict) and "content" in data:
            return model_cls.model_validate(orjson.loads(data["content"]))
        raise e


def embed_texts(texts: List[str], model: str | None = None) -> List[List[float]]:
    """Return embeddings for a list of texts using OpenAI embeddings API."""
    if not texts:
        return []
    client = get_openai_client()
    m = model or EMBED_MODEL
    resp = client.embeddings.create(model=m, input=texts)
    return [item.embedding for item in resp.data]


