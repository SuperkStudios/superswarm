"""Startpage search: the second independent engine behind DuckDuckGo.

DuckDuckGo is one operator, so its bot challenge is one point of failure for
every keyless user. Startpage serves Google's index and answered 8/8 on the
same machine and rounds where DuckDuckGo's shipped client shape answered 4/8,
so it is a genuine second opinion rather than a retry.

It must be a POST: a GET to /sp/search is answered with an Anubis
proof-of-work interstitial (measured, ~10KB and zero results), while the POST
returns the real result page. Parsing is anchored on `result-link` /
`gl-title-link` and the `description` paragraph, never on the emotion CSS
hashes in the same class attributes, which change build to build.

Answers a `StartpageAnswer` rather than a string because "closed" and
"genuinely no hits" look identical on the wire (both are a 200 with no result
anchors) and the caller has to act on them differently: a refusal is a failed
tier that should count against the engine, an empty result set is the honest
answer to a nonsense query. Startpage names the second case itself, in an
"Uh-oh, there are no results for this search" page."""

import html
import re
from typing import List

from pydantic import BaseModel, ConfigDict
from typeguard import typechecked

from backend.apps.agents.tools.browser_http import browser_request

P_SEARCH_URL = "https://www.startpage.com/sp/search"
P_TIMEOUT = 12.0

P_ANCHOR_RE = re.compile(
    r"<a\b([^>]*(?:result-link|gl-title-link)[^>]*)>(.*?)</a>", flags=re.DOTALL,
)
P_HREF_RE = re.compile(r'href="([^"]+)"')
P_TITLE_RE = re.compile(r"<h2[^>]*>(.*?)</h2>", flags=re.DOTALL)
P_DESC_RE = re.compile(
    r'<p[^>]*class="[^"]*\bdescription\b[^"]*"[^>]*>(.*?)</p>', flags=re.DOTALL,
)
# Startpage inlines a <style> block inside each result anchor, so tag-stripping alone would emit CSS as the title.
P_NOISE_RE = re.compile(r"<(script|style)\b[^>]*>.*?</\1>", flags=re.DOTALL | re.IGNORECASE)
P_TAG_RE = re.compile(r"<[^>]+>")
P_NO_RESULTS_MARKER = "there are no results for this search"


class StartpageAnswer(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    results: str = ""
    # Challenge, error, or markup we no longer recognise: Startpage did not answer the question.
    refused: bool = False


@typechecked
def p_strip(raw: str) -> str:
    return re.sub(r"\s+", " ", html.unescape(P_TAG_RE.sub("", P_NOISE_RE.sub("", raw)))).strip()


@typechecked
def parse_startpage_results(body: str, num_results: int) -> str:
    """Format Startpage's result rows; a snippet is only paired when it sits INSIDE its own result block."""
    anchors = list(P_ANCHOR_RE.finditer(body))
    entries: List[str] = []
    for i, match in enumerate(anchors[:num_results]):
        href = P_HREF_RE.search(match.group(1))
        if not href:
            continue
        title_match = P_TITLE_RE.search(match.group(2))
        title = p_strip(title_match.group(1)) if title_match else p_strip(match.group(2))
        if not title:
            continue
        entry = f"[{len(entries) + 1}] {title}\n    {html.unescape(href.group(1))}"
        block_end = anchors[i + 1].start() if i + 1 < len(anchors) else len(body)
        desc = P_DESC_RE.search(body, match.end(), block_end)
        if desc:
            snippet = p_strip(desc.group(1))
            if snippet:
                entry += f"\n    {snippet}"
        entries.append(entry)
    return "\n\n".join(entries)


@typechecked
async def search_startpage(query: str, num_results: int) -> StartpageAnswer:
    """Startpage's answer: results, an honest nothing, or a refusal."""
    reply = await browser_request(
        P_SEARCH_URL, method="POST", params={"query": query, "cat": "web"}, timeout=P_TIMEOUT,
    )
    if reply.status != 200:
        return StartpageAnswer(refused=True)
    results = parse_startpage_results(reply.text, num_results)
    if results:
        return StartpageAnswer(results=results)
    # Measured once in 14 tight-loop requests: Startpage serves its own no-results page for a query that answered 10 results a second later, so an empty page is only trustworthy when it says so.
    if P_NO_RESULTS_MARKER in reply.text:
        return StartpageAnswer()
    return StartpageAnswer(refused=True)
