"""Talk to the cloud's hosted-workflow routes on behalf of this desktop.

Two failure kinds, kept apart on purpose. CloudRefused means the server answered
and said no, and its message is written for the user, so it is shown verbatim.
CloudUnreachable means we never got an answer, which is NOT a no: the caller must
render "we cannot tell" rather than inventing a denial or a usage number.
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

import httpx
from pydantic import BaseModel, ConfigDict, Field
from typeguard import typechecked

from backend.apps.settings.credentials import account_auth
from backend.apps.workflows.cloud.schedule import CloudSchedule

# The cloud router is mounted at /api/workflows and a trailing slash 404s there, so the collection paths are the empty string, not "/".
COLLECTION = ""
TIMEOUT_SECONDS = 8.0


class CloudRefused(Exception):
    """The cloud answered and declined. `message` is user-facing prose."""

    def __init__(self, message: str, status: int) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


class CloudUnreachable(Exception):
    """No answer at all: offline, timed out, 5xx, or a body we could not parse."""

    def __init__(self, detail: str) -> None:
        super().__init__(detail)
        self.detail = detail


class SignedOut(Exception):
    """No bearer on this machine, or the cloud rejected the one we have."""


class CloudLimits(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    workflows: int = 0
    runs_per_month: int = 0
    concurrent: int = 0


class CloudUsage(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    workflows_enabled: int = 0
    runs_this_month: int = 0


class CloudCapability(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    ok: bool
    reason: Optional[str] = None


class HostedWorkflow(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    id: str
    enabled: bool = False
    next_run_at: Optional[int] = None


class CloudPreflight(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    # None when the control plane did not name the plan. Entitlement is read off limits, never off this string.
    plan: Optional[str] = None
    limits: CloudLimits = Field(default_factory=CloudLimits)
    usage: CloudUsage = Field(default_factory=CloudUsage)
    # None when this control plane predates the capability check, which is a "we cannot tell", never an "it is fine".
    capability: Optional[CloudCapability] = None
    hosted: Optional[HostedWorkflow] = None


class CloudRun(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    id: str
    status: str
    started_at: Optional[int] = None
    finished_at: Optional[int] = None
    error: Optional[str] = None
    answer: Optional[str] = None
    notices: List[str] = Field(default_factory=list)
    cost_usd: Optional[float] = None


@typechecked
def p_message(resp: httpx.Response, fallback: str) -> str:
    """The cloud's own words for a refusal. Hono renders an HTTPException as a bare
    text/plain sentence, so a JSON-only reader would silently swap every written
    reason for a generic one; both shapes are read here."""
    raw = (resp.text or "").strip()
    if not raw:
        return fallback
    try:
        body = resp.json()
    except (json.JSONDecodeError, ValueError):
        body = None
    if isinstance(body, dict):
        for key in ("message", "error"):
            value = body.get(key)
            if isinstance(value, str) and value:
                return value
        return fallback
    # Anything short and prose-shaped is the message itself; an HTML error page is not.
    if len(raw) <= 500 and not raw.startswith("<"):
        return raw
    return fallback


@typechecked
async def p_call(method: str, path: str, body: Optional[Dict[str, Any]] = None) -> Any:
    from backend.apps.settings.store import load_settings

    token, base = account_auth(load_settings())
    if not token:
        raise SignedOut()
    try:
        async with httpx.AsyncClient(timeout=TIMEOUT_SECONDS) as client:
            resp = await client.request(
                method,
                f"{base}/api/workflows{path}",
                headers={"Authorization": f"Bearer {token}"},
                json=body,
            )
    except httpx.HTTPError as exc:
        raise CloudUnreachable(f"{type(exc).__name__}") from exc
    if resp.status_code == 401:
        raise SignedOut()
    # A 404 on a route we expect means an older control plane; the caller decides whether that is fatal.
    if resp.status_code >= 500:
        raise CloudUnreachable(f"the cloud returned {resp.status_code}")
    if resp.status_code >= 400:
        raise CloudRefused(p_message(resp, "The cloud declined this request."), resp.status_code)
    try:
        return resp.json()
    except (json.JSONDecodeError, ValueError) as exc:
        raise CloudUnreachable("the cloud sent a response we could not read") from exc


@typechecked
def p_hosted(raw: Any) -> Optional[HostedWorkflow]:
    if not isinstance(raw, dict):
        return None
    ident = raw.get("id")
    if not isinstance(ident, str):
        return None
    nxt = raw.get("next_run_at")
    return HostedWorkflow(
        id=ident,
        enabled=bool(raw.get("enabled")),
        next_run_at=nxt if isinstance(nxt, int) else None,
    )


@typechecked
def p_allowance(raw: Dict[str, Any]) -> tuple[CloudLimits, CloudUsage]:
    """What the plan allows and what has been spent, from either shape the cloud answers in."""
    limits = raw.get("limits") if isinstance(raw.get("limits"), dict) else {}
    usage = raw.get("usage") if isinstance(raw.get("usage"), dict) else {}
    return (
        CloudLimits(
            workflows=int(limits.get("workflows") or 0),
            runs_per_month=int(limits.get("runsPerMonth") or 0),
            concurrent=int(limits.get("concurrent") or 0),
        ),
        CloudUsage(
            workflows_enabled=int(usage.get("enabled") or 0),
            runs_this_month=int(usage.get("runs_this_month") or 0),
        ),
    )


@typechecked
async def preflight(definition: Dict[str, Any], hosted_id: Optional[str]) -> CloudPreflight:
    """Plan, spend, and whether the runner could do this job, in one round trip.
    Falls back to the plain list route when the control plane has no preflight,
    which leaves `capability` unknown rather than pretending it passed."""
    body: Dict[str, Any] = {"definition": definition}
    if hosted_id:
        body["hosted_id"] = hosted_id
    try:
        raw = await p_call("POST", "/preflight", body)
    except CloudRefused as exc:
        if exc.status != 404:
            raise
        return await p_preflight_from_list(hosted_id)
    if not isinstance(raw, dict):
        raise CloudUnreachable("the cloud sent a preflight we could not read")
    limits, usage = p_allowance(raw)
    capability = raw.get("capability")
    return CloudPreflight(
        plan=raw.get("plan") if isinstance(raw.get("plan"), str) else None,
        limits=limits,
        usage=usage,
        capability=(
            CloudCapability(ok=bool(capability.get("ok")), reason=capability.get("reason"))
            if isinstance(capability, dict)
            else None
        ),
        hosted=p_hosted(raw.get("hosted")),
    )


@typechecked
async def p_preflight_from_list(hosted_id: Optional[str]) -> CloudPreflight:
    raw = await p_call("GET", COLLECTION)
    if not isinstance(raw, dict):
        raise CloudUnreachable("the cloud sent a workflow list we could not read")
    rows = raw.get("workflows") if isinstance(raw.get("workflows"), list) else []
    match = next((r for r in rows if isinstance(r, dict) and r.get("id") == hosted_id), None)
    limits, usage = p_allowance(raw)
    return CloudPreflight(plan=None, limits=limits, usage=usage, capability=None, hosted=p_hosted(match))


@typechecked
async def put_workflow(
    *, hosted_id: Optional[str], name: str, definition: Dict[str, Any], schedule: CloudSchedule
) -> HostedWorkflow:
    """Create the hosted copy, or re-push onto the existing row so an edited
    workflow stops running last week's prose."""
    body = {"name": name, "definition": definition, "schedule": schedule.model_dump()}
    if hosted_id:
        try:
            raw = await p_call("POST", f"/{hosted_id}/update", body)
            hosted = p_hosted(raw)
            if hosted:
                return hosted
        except CloudRefused as exc:
            # 404 is the row being gone (deleted elsewhere, or a control plane with no update route); make a fresh one.
            if exc.status != 404:
                raise
    raw = await p_call("POST", COLLECTION, body)
    hosted = p_hosted(raw)
    if not hosted:
        raise CloudUnreachable("the cloud accepted the workflow but did not say which one")
    return hosted


@typechecked
async def set_enabled(hosted_id: str, enabled: bool) -> HostedWorkflow:
    raw = await p_call("POST", f"/{hosted_id}/enable", {"enabled": enabled})
    hosted = p_hosted(raw)
    if not hosted:
        raise CloudUnreachable("the cloud did not report the workflow back")
    return hosted


@typechecked
async def delete_hosted(hosted_id: str) -> None:
    """Stop the cloud copy. A 404 is success: it is already gone."""
    try:
        await p_call("POST", f"/{hosted_id}/delete", {})
    except CloudRefused as exc:
        if exc.status != 404:
            raise


@typechecked
async def list_runs(hosted_id: str) -> List[CloudRun]:
    raw = await p_call("GET", f"/{hosted_id}/runs")
    rows = raw.get("runs") if isinstance(raw, dict) else None
    if not isinstance(rows, list):
        raise CloudUnreachable("the cloud sent a run list we could not read")
    out: List[CloudRun] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        notices = row.get("notices")
        out.append(
            CloudRun(
                id=str(row.get("id") or ""),
                status=str(row.get("status") or "unknown"),
                started_at=row.get("started_at") if isinstance(row.get("started_at"), int) else None,
                finished_at=row.get("finished_at") if isinstance(row.get("finished_at"), int) else None,
                error=row.get("error") if isinstance(row.get("error"), str) else None,
                answer=row.get("answer") if isinstance(row.get("answer"), str) else None,
                notices=[n for n in notices if isinstance(n, str)] if isinstance(notices, list) else [],
                cost_usd=row.get("cost_usd") if isinstance(row.get("cost_usd"), (int, float)) else None,
            )
        )
    return out
