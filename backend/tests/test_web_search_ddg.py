"""DuckDuckGo parsing robustness: bot challenge (202) and ad-row stripping.

These pin the two bugs that turned DDG into a flaky 'No results found' source:
  1. DDG serves its bot challenge as HTTP 202 (a 2xx), so a status check missed
     it and we parsed an empty page as a real empty result set.
  2. Sponsored rows point at DDG's own y.js click-tracker (ad_domain/ad_provider)
     and were emitted as junk 'duckduckgo.com/y.js?...' results.

We mock the network so the test is deterministic and offline.
"""

import pytest

import backend.apps.agents.tools.search.search_ddg as SD
import backend.apps.agents.tools.search.search_ddg_lite as SDL
from backend.apps.agents.tools.browser_http import HttpReply
from backend.apps.agents.tools.web import WebSearchTool, DDGRateLimited


def p_reply(status: int, text: str) -> HttpReply:
    return HttpReply(status=status, text=text, content=text.encode(),
                     content_type="text/html", url="https://duckduckgo.example")


def p_patch_client(monkeypatch, reply: HttpReply):
    """Mock the ONE seam every keyless rung goes through, whatever transport it picks."""
    async def p_req(url, **kw):
        return reply
    monkeypatch.setattr(SD, "browser_request", p_req)
    monkeypatch.setattr(SDL, "browser_request", p_req)


# One real organic result + one sponsored (ad) row in DDG's html markup.
P_HTML_WITH_AD = """
<div class="result results_links_deep">
  <a class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Freal&amp;rut=x">Real Result Title</a>
  <a class="result__snippet">A genuine snippet about the topic.</a>
</div>
<div class="result result--ad">
  <a class="result__a" href="//duckduckgo.com/y.js?ad_domain=advertiser.com&amp;ad_provider=bingv7aa&amp;ad_type=txad">Sponsored Junk</a>
  <a class="result__snippet">Buy now!</a>
</div>
"""


@pytest.mark.asyncio
async def test_202_raises_rate_limited_not_empty(monkeypatch):
    p_patch_client(monkeypatch, p_reply(202, "<html>throttle challenge, no results</html>"))
    with pytest.raises(DDGRateLimited):
        await WebSearchTool.search_ddg("anything", 5)


@pytest.mark.asyncio
async def test_execute_names_the_real_cause_not_a_rate_limit(monkeypatch):
    p_patch_client(monkeypatch, p_reply(202, "challenge"))
    parts = await WebSearchTool().execute({"query": "x", "num_results": 5}, None)
    msg = parts[0]["text"].lower()
    assert "bot challenge" in msg
    assert "no search results" not in msg  # the old bogus message must be gone
    # It is a fingerprint challenge, not a cooldown, so we must not send the model off to wait.
    assert "rate-limit" not in msg and "rate limit" not in msg
    assert "wait" not in msg


@pytest.mark.asyncio
async def test_ads_are_stripped_real_results_kept(monkeypatch):
    p_patch_client(monkeypatch, p_reply(200, P_HTML_WITH_AD))
    out = await WebSearchTool.search_ddg("topic", 5)
    assert "example.com/real" in out
    assert "Real Result Title" in out
    # the sponsored row and its tracker URL must not appear
    assert "y.js" not in out
    assert "advertiser.com" not in out
    assert "Sponsored Junk" not in out


@pytest.mark.asyncio
async def test_genuinely_empty_is_not_a_rate_limit(monkeypatch):
    # 200 with no result blocks is a real empty result set, not a throttle.
    p_patch_client(monkeypatch, p_reply(200, "<html><body>nothing here</body></html>"))
    out = await WebSearchTool.search_ddg("zxcvqwer no hits", 5)
    assert out == ""
