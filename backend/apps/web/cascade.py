"""Deadline-bounded tier runner shared by /api/web/search and /api/web/fetch.

The cascades used to sum their per-tier leashes to 244s (search) and 270s
(fetch) while the MCP shim calling them gave up at 45s, so the later tiers
could never run at all: whether a search worked came down to whether an early
tier happened to win the race before the client-side guillotine. One wall-clock
deadline for the whole cascade makes that unrepresentable. A tier can only ever
spend what is LEFT of the budget, so a slow tier cannot starve the ones behind
it, and the endpoint always answers within the deadline."""

import asyncio
from typing import Awaitable, Callable, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, InstanceOf
from typeguard import typechecked

from backend.apps.web.tier_breaker import (
    record_tier_failure,
    record_tier_success,
    tier_cooldown_left,
)

# A tier handed less than this has no realistic chance, and reporting it as a timeout would be a lie; we say the budget ran out instead.
MIN_TIER_SECONDS = 3.0


class CascadeTier(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    name: str
    run: InstanceOf[Callable[[], Awaitable[Optional[Dict]]]]
    budget: float
    # Only for tiers whose failure is a property of the HOST, not of this request; see tier_breaker.
    breaker: bool = False


class CascadeOutcome(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    result: Optional[Dict] = None
    errors: List[str] = Field(default_factory=list)


@typechecked
async def run_cascade(tiers: List[CascadeTier], total_budget: float) -> CascadeOutcome:
    """Run tiers in order until one returns a result or the budget is gone."""
    loop = asyncio.get_running_loop()
    deadline = loop.time() + total_budget
    errors: List[str] = []

    for tier in tiers:
        remaining = deadline - loop.time()
        if remaining < MIN_TIER_SECONDS:
            skipped = [t.name for t in tiers[tiers.index(tier):]]
            errors.append(
                f"{total_budget:.0f}s cascade budget spent; not attempted: {', '.join(skipped)}"
            )
            break
        cooling = tier_cooldown_left(tier.name) if tier.breaker else 0.0
        if cooling:
            errors.append(f"{tier.name}: skipped, still failing (retry in {cooling:.0f}s)")
            continue
        slice_seconds = min(tier.budget, remaining)
        try:
            result = await asyncio.wait_for(tier.run(), timeout=slice_seconds)
        except asyncio.TimeoutError:
            errors.append(f"{tier.name}: timed out after {slice_seconds:.0f}s")
            if tier.breaker:
                record_tier_failure(tier.name)
        except Exception as exc:
            errors.append(f"{tier.name}: {str(exc)[:150]}")
            if tier.breaker:
                record_tier_failure(tier.name)
        else:
            # Answering "no hits" still proves the host is up, so it clears the failure streak.
            if tier.breaker:
                record_tier_success(tier.name)
            if result is not None:
                return CascadeOutcome(result=result, errors=errors)

    return CascadeOutcome(result=None, errors=errors)
