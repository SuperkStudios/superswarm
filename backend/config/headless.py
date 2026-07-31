"""Headless mode: the backend running with no Electron renderer, no display, and no human
(a Linux container). Single source of truth for the flag and for the tools that dead-end at a
renderer, so they are dropped from the tool surface up front instead of hanging at call time."""

import os
from typing import Dict, FrozenSet

from typeguard import typechecked

# Each of these ends at the Electron renderer: browser/app delegation drives live webviews, ShowUI (the same gate AskUI rides) draws into the transcript, and AskUserQuestion waits on a person who isn't there.
HEADLESS_DENIED_TOOLS: FrozenSet[str] = frozenset({
    "CreateBrowserAgent",
    "BrowserAgent",
    "BrowserAgents",
    "AppAgent",
    "ShowUI",
    "AskUserQuestion",
})


@typechecked
def is_headless() -> bool:
    """True when the backend was started with OPENSWARM_HEADLESS=1. Read per call rather than
    frozen at import, so a launcher that sets it late still counts (and tests can flip it)."""
    return os.environ.get("OPENSWARM_HEADLESS") == "1"


@typechecked
def apply_headless_denies(builtin_perms: Dict[str, str]) -> Dict[str, str]:
    """The permission map with every renderer-bound tool forced to 'deny' when headless, and the
    map itself untouched otherwise. Returns a copy so the mode never poisons the live snapshot."""
    if not is_headless():
        return builtin_perms
    return {**builtin_perms, **{name: "deny" for name in HEADLESS_DENIED_TOOLS}}
