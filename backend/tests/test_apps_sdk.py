"""The apps SDK host surface (ENG-202): provider-agnostic LLM completions and positioned agent
spawns for OpenSwarm-built apps, plus the template helpers that ride them."""

import os

from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)
P_TEMPLATE = os.path.join(os.path.dirname(__file__), "..", "apps", "outputs", "webapp_template")


def p_auth() -> dict:
    from backend.auth import init_auth_token
    return {"Authorization": f"Bearer {init_auth_token()}"}


class Blk:
    def __init__(self, type: str, text: str = "") -> None:
        self.type = type
        self.text = text


class FakeStream:
    def __init__(self, resp) -> None:
        self.resp = resp

    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False

    async def get_final_message(self):
        return self.resp


class FakeLLMClient:
    def __init__(self) -> None:
        self.calls = []
        self.messages = self

    def stream(self, **kw):
        self.calls.append(kw)
        resp = type("R", (), {"content": [Blk("text", "hello from fake")]})()
        return FakeStream(resp)


def test_llm_routes_through_the_users_provider(monkeypatch):
    import backend.apps.agents.providers.registry as reg
    import backend.apps.settings.credentials as cred
    import backend.apps.settings.settings as settings_mod

    fake = FakeLLMClient()
    monkeypatch.setattr(settings_mod, "load_settings", lambda: {"fake": True}, raising=True)

    async def p_aux(settings, preferred_tier="haiku", primary_api=None):
        return ("aux-cheap", None)
    monkeypatch.setattr(reg, "resolve_aux_model", p_aux, raising=True)
    monkeypatch.setattr(cred, "get_anthropic_client_for_model", lambda s, m: fake, raising=True)

    r = client.post("/api/apps-sdk/llm", json={"prompt": "say hello"}, headers=p_auth())
    assert r.status_code == 200, r.text
    assert r.json() == {"text": "hello from fake", "model": "aux-cheap"}
    assert fake.calls[0]["model"] == "aux-cheap"


def test_llm_honors_an_explicit_model(monkeypatch):
    import backend.apps.agents.providers.registry as reg
    import backend.apps.settings.credentials as cred
    import backend.apps.settings.settings as settings_mod

    fake = FakeLLMClient()
    monkeypatch.setattr(settings_mod, "load_settings", lambda: {"fake": True}, raising=True)
    monkeypatch.setattr(reg, "resolve_model_id_for_sdk", lambda short, s: f"resolved-{short}", raising=True)
    monkeypatch.setattr(cred, "get_anthropic_client_for_model", lambda s, m: fake, raising=True)

    r = client.post("/api/apps-sdk/llm", json={"prompt": "hi", "model": "haiku", "system": "terse"},
                    headers=p_auth())
    assert r.status_code == 200, r.text
    assert r.json()["model"] == "resolved-haiku"
    assert fake.calls[0]["system"] == "terse"


def test_llm_rejects_an_empty_prompt():
    r = client.post("/api/apps-sdk/llm", json={"prompt": "   "}, headers=p_auth())
    assert r.status_code == 422


def test_spawn_agent_launches_and_broadcasts_position(monkeypatch):
    import backend.apps.dashboards.dashboards as dash_mod
    from backend.apps.agents import agent_manager as am_mod
    from backend.apps.agents.core import ws_manager as ws_mod
    from backend.apps.agents.core.models import AgentSession

    monkeypatch.setattr(dash_mod, "load_all", lambda: [], raising=True)
    launched = []
    messaged = []
    broadcasts = []

    async def p_launch(config):
        launched.append(config)
        return AgentSession(id="sess-1", name=config.name, model=config.model, mode=config.mode)

    async def p_send(session_id, prompt):
        messaged.append((session_id, prompt))

    async def p_broadcast(event, payload):
        broadcasts.append((event, payload))

    monkeypatch.setattr(am_mod.agent_manager, "launch_agent", p_launch, raising=True)
    monkeypatch.setattr(am_mod.agent_manager, "send_message", p_send, raising=True)
    monkeypatch.setattr(ws_mod.ws_manager, "broadcast_global", p_broadcast, raising=True)

    r = client.post("/api/apps-sdk/agents/spawn", json={
        "prompt": "research crm tools", "name": "CRM scout", "x": 400, "y": 300,
    }, headers=p_auth())
    assert r.status_code == 200, r.text
    assert r.json() == {"session_id": "sess-1"}
    assert launched[0].name == "CRM scout" and launched[0].prompt == "research crm tools"
    assert broadcasts == [("apps_sdk:place_agent_card",
                           {"session_id": "sess-1", "dashboard_id": None, "x": 400.0, "y": 300.0})]


def test_spawn_agent_without_position_skips_the_broadcast(monkeypatch):
    import backend.apps.dashboards.dashboards as dash_mod
    from backend.apps.agents import agent_manager as am_mod
    from backend.apps.agents.core import ws_manager as ws_mod
    from backend.apps.agents.core.models import AgentSession

    monkeypatch.setattr(dash_mod, "load_all", lambda: [], raising=True)
    broadcasts = []

    async def p_launch(config):
        return AgentSession(id="sess-2", name=config.name, model=config.model, mode=config.mode)

    async def p_send(session_id, prompt):
        return None

    async def p_broadcast(event, payload):
        broadcasts.append(event)

    monkeypatch.setattr(am_mod.agent_manager, "launch_agent", p_launch, raising=True)
    monkeypatch.setattr(am_mod.agent_manager, "send_message", p_send, raising=True)
    monkeypatch.setattr(ws_mod.ws_manager, "broadcast_global", p_broadcast, raising=True)

    r = client.post("/api/apps-sdk/agents/spawn", json={"prompt": "hi"}, headers=p_auth())
    assert r.status_code == 200
    assert broadcasts == []


def test_template_ships_both_sdk_helpers_and_the_skill_references_them():
    front = os.path.join(P_TEMPLATE, "frontend", "src", "openswarmHost.ts")
    back = os.path.join(P_TEMPLATE, "backend", "apps", "openswarm_host", "openswarm_host.py")
    guide = os.path.join(P_TEMPLATE, "SDK.md")
    assert os.path.exists(front) and os.path.exists(back) and os.path.exists(guide)
    skill_path = os.path.join(P_TEMPLATE, "..", "app_builder_skill.md")
    with open(skill_path, "r", encoding="utf-8") as f:
        skill = f.read()
    assert "SDK.md" in skill and "openswarmHost" in skill and "openswarm_host" in skill
    # The tools/MCP surface is deliberately not wired yet; the guide must not advertise it as available.
    with open(guide, "r", encoding="utf-8") as f:
        text = f.read()
    assert "does NOT give you" in text
