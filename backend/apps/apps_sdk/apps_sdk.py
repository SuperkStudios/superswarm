"""REST surface for OpenSwarm-built apps (the app-side SDK's host half).

Apps already hold the install token (frontend via ?token=, backends via
OPENSWARM_HOST_TOKEN_FILE), and workflows/agents already expose first-class
routes the SDK helpers call directly. This SubApp adds only what REST could
not do before: a provider-agnostic LLM completion, and an agent spawn that
can land its card at a position on the canvas.
"""

from contextlib import asynccontextmanager
from typing import Any, AsyncIterator, Dict, Optional

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict
from typeguard import typechecked

from backend.config.Apps import SubApp


@asynccontextmanager
async def apps_sdk_lifespan() -> AsyncIterator[None]:
    yield


apps_sdk = SubApp("apps-sdk", apps_sdk_lifespan)


class LlmRequest(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    prompt: str
    system: Optional[str] = None
    # Short model name (sonnet/haiku/gpt-5-mini/...); absent means the cheap tier of whatever provider the user runs.
    model: Optional[str] = None
    max_tokens: int = 1024


class LlmReply(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    text: str
    model: str


@apps_sdk.router.post("/llm")
@typechecked
async def llm(body: LlmRequest) -> LlmReply:
    from backend.apps.agents.providers.registry import resolve_aux_model, resolve_model_id_for_sdk
    from backend.apps.settings.credentials import get_anthropic_client_for_model
    from backend.apps.settings.settings import load_settings

    if not body.prompt.strip():
        raise HTTPException(status_code=422, detail="prompt is empty")
    settings = load_settings()
    if body.model:
        api_model = resolve_model_id_for_sdk(body.model, settings)
    else:
        api_model, _ = await resolve_aux_model(settings)
    client = get_anthropic_client_for_model(settings, api_model)
    kwargs: Dict[str, Any] = {
        "model": api_model,
        "max_tokens": max(1, min(body.max_tokens, 8192)),
        "messages": [{"role": "user", "content": body.prompt}],
    }
    if body.system:
        kwargs["system"] = body.system
    try:
        # STREAM, never .create(): 9router's non-Anthropic lanes answer as real SSE that the non-streaming client parses to empty content.
        async with client.messages.stream(**kwargs) as stream:
            resp = await stream.get_final_message()
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"LLM call failed: {e}")
    text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
    return LlmReply(text=text, model=api_model)


class SpawnAgentRequest(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    prompt: str
    name: str = "Agent"
    model: Optional[str] = None
    dashboard_id: Optional[str] = None
    # Canvas-space position for the spawned card; both present or the placement broadcast is skipped.
    x: Optional[float] = None
    y: Optional[float] = None


class SpawnAgentReply(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    session_id: str


@apps_sdk.router.post("/agents/spawn")
@typechecked
async def spawn_agent(body: SpawnAgentRequest) -> SpawnAgentReply:
    import asyncio

    from backend.apps.agents.agent_manager import agent_manager
    from backend.apps.agents.core.models import AgentConfig
    from backend.apps.agents.core.ws_manager import ws_manager

    if not body.prompt.strip():
        raise HTTPException(status_code=422, detail="prompt is empty")
    dashboard_id = body.dashboard_id
    if dashboard_id is None:
        # An app webview has no idea which dashboard it lives on; without one the canvas lifecycle
        # never creates a card, so the spawn is real but invisible. Most-recent dashboard wins.
        from backend.apps.dashboards.dashboards import load_all
        boards = sorted(load_all(), key=lambda d: d.updated_at, reverse=True)
        dashboard_id = boards[0].id if boards else None
    config = AgentConfig(
        name=body.name,
        prompt=body.prompt,
        model=body.model or "sonnet",
        dashboard_id=dashboard_id,
    )
    session = await agent_manager.launch_agent(config)
    asyncio.create_task(agent_manager.send_message(session.id, body.prompt))
    if body.x is not None and body.y is not None:
        await ws_manager.broadcast_global("apps_sdk:place_agent_card", {
            "session_id": session.id,
            "dashboard_id": dashboard_id,
            "x": body.x,
            "y": body.y,
        })
    return SpawnAgentReply(session_id=session.id)
