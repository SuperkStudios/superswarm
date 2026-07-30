"""A dead search frontend must stop costing us its whole tier budget.

Measured before this existed: once DuckDuckGo stopped answering TCP, three
consecutive 44-query rounds each paid the full 8s DuckDuckGo budget on EVERY
query, so keyless p50 went 1.0s -> 8.5s while Startpage still served 40/40.
These pin the breaker that makes that unrepresentable, and pin the two ways it
could go wrong instead: skipping a healthy tier, or leaking a per-URL failure
into a fixed-host one.
"""

import asyncio

import pytest

import backend.apps.web.cascade as C
from backend.apps.web.cascade import CascadeTier, run_cascade
from backend.apps.web.tier_breaker import (
    FAILURES_TO_OPEN,
    FIRST_COOLDOWN_SECONDS,
    MAX_COOLDOWN_SECONDS,
    record_tier_failure,
    record_tier_success,
    reset_tier_health,
    tier_cooldown_left,
)


@pytest.fixture(autouse=True)
def p_clean():
    reset_tier_health()
    yield
    reset_tier_health()


@pytest.fixture
def p_tiny_floor(monkeypatch):
    monkeypatch.setattr(C, "MIN_TIER_SECONDS", 0.01)


async def p_boom():
    raise RuntimeError("engine closed")


async def p_hit():
    return {"backend": "second"}


def test_streak_opens_then_success_clears():
    for _ in range(FAILURES_TO_OPEN - 1):
        record_tier_failure("ddg")
    assert tier_cooldown_left("ddg") == 0.0
    record_tier_failure("ddg")
    assert 0 < tier_cooldown_left("ddg") <= FIRST_COOLDOWN_SECONDS
    record_tier_success("ddg")
    assert tier_cooldown_left("ddg") == 0.0


def test_cooldown_doubles_and_is_capped():
    seen = []
    now = 0.0
    for round_no in range(12):
        for _ in range(FAILURES_TO_OPEN):
            record_tier_failure("ddg", now=now)
        seen.append(tier_cooldown_left("ddg", now=now))
        now += seen[-1] + 1
        record_tier_failure("ddg", now=now)  # the half-open probe fails again
    assert seen[0] == pytest.approx(FIRST_COOLDOWN_SECONDS)
    assert seen[1] > seen[0]
    assert max(seen) <= MAX_COOLDOWN_SECONDS


@pytest.mark.asyncio
async def test_dead_tier_is_skipped_instantly(p_tiny_floor):
    calls = []

    async def p_slow_boom():
        calls.append(1)
        await asyncio.sleep(0.05)
        raise RuntimeError("engine closed")

    tiers = [
        CascadeTier(name="ddg", run=p_slow_boom, budget=5.0, breaker=True),
        CascadeTier(name="startpage", run=p_hit, budget=5.0, breaker=True),
    ]
    for _ in range(FAILURES_TO_OPEN):
        out = await run_cascade(tiers, 5.0)
        assert out.result == {"backend": "second"}
    assert len(calls) == FAILURES_TO_OPEN

    out = await run_cascade(tiers, 5.0)
    assert out.result == {"backend": "second"}
    assert len(calls) == FAILURES_TO_OPEN, "a cooling tier must not be called at all"
    assert any("skipped, still failing" in e for e in out.errors)


@pytest.mark.asyncio
async def test_timeout_counts_as_failure(p_tiny_floor):
    async def p_hangs():
        await asyncio.sleep(30)

    tiers = [
        CascadeTier(name="ddg", run=p_hangs, budget=0.05, breaker=True),
        CascadeTier(name="startpage", run=p_hit, budget=5.0, breaker=True),
    ]
    for _ in range(FAILURES_TO_OPEN):
        await run_cascade(tiers, 5.0)
    assert tier_cooldown_left("ddg") > 0


@pytest.mark.asyncio
async def test_no_hits_is_not_a_failure(p_tiny_floor):
    """An engine that answers 'nothing matched' is alive; only errors count against it."""
    async def p_empty():
        return None

    tiers = [
        CascadeTier(name="ddg", run=p_empty, budget=5.0, breaker=True),
        CascadeTier(name="startpage", run=p_hit, budget=5.0, breaker=True),
    ]
    for _ in range(FAILURES_TO_OPEN + 2):
        await run_cascade(tiers, 5.0)
    assert tier_cooldown_left("ddg") == 0.0


@pytest.mark.asyncio
async def test_tiers_without_breaker_always_run(p_tiny_floor):
    """A fetch tier fails per-URL, so one dead page must never cool the tier for every other URL."""
    calls = []

    async def p_fail():
        calls.append(1)
        raise RuntimeError("404")

    tiers = [
        CascadeTier(name="local", run=p_fail, budget=5.0),
        CascadeTier(name="wayback", run=p_hit, budget=5.0),
    ]
    for _ in range(FAILURES_TO_OPEN + 3):
        await run_cascade(tiers, 5.0)
    assert len(calls) == FAILURES_TO_OPEN + 3
    assert tier_cooldown_left("local") == 0.0
