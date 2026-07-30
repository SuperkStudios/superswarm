"""Shared fixtures for the /api/web cascade tests: everything offline by default."""

import pytest

import backend.apps.agents.tools.fetch.wayback as WB
import backend.apps.agents.tools.search.search_startpage as SP
import backend.apps.web.web as W
from backend.apps.agents.tools.web import DDGRateLimited, WebSearchTool
import backend.apps.agents.tools.ssrf_guard as p_ssrf


@pytest.fixture(autouse=True)
def no_network(monkeypatch):
    # Default everything to "unavailable / no network"; each test opts paths in.
    monkeypatch.setattr(W, "resolve_gemini_api_key", lambda: None)
    monkeypatch.setattr(W, "resolve_openai_api_key", lambda: None)

    async def p_no_subs():
        return set()
    monkeypatch.setattr(W, "refresh_9r_connected", p_no_subs)

    async def p_empty(*a, **k):
        return {}
    # subscription helpers hit localhost:20128 otherwise
    monkeypatch.setattr(W, "gemini_grounded_via_9router", p_empty)
    monkeypatch.setattr(W, "openai_websearch_via_9router", p_empty)

    async def p_startpage_closed(query, num):
        return None
    monkeypatch.setattr(SP, "search_startpage", p_startpage_closed)

    async def p_no_snapshot(url):
        return None
    monkeypatch.setattr(WB, "fetch_wayback", p_no_snapshot)


@pytest.fixture(autouse=True)
def allow_urls(monkeypatch):
    async def p_ok(url):
        return None
    monkeypatch.setattr(p_ssrf, "assert_safe_url", p_ok)


def ddg_returns(monkeypatch, text):
    async def p_f(query, num):
        return text
    monkeypatch.setattr(WebSearchTool, "search_ddg", staticmethod(p_f))


def ddg_throttled(monkeypatch):
    async def p_f(query, num):
        raise DDGRateLimited(query)
    monkeypatch.setattr(WebSearchTool, "search_ddg", staticmethod(p_f))


def startpage_returns(monkeypatch, text):
    async def p_f(query, num):
        return text
    monkeypatch.setattr(SP, "search_startpage", p_f)


def patch_browser_bridge(monkeypatch, result):
    """Patch the offscreen-browser bridge; result=None simulates 'no Electron main bridge connected'."""
    async def p_f(action, params):
        return result
    monkeypatch.setattr(W, "p_browser_bridge", p_f)
