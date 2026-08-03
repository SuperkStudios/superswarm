"""Rigorous coverage for capacity_retry_wait, the transient-error backoff decision lifted
into error_classify.py next to the classifier it uses. It was previously inline + untestable
in the agent loop's retry while-loop."""

import anthropic
import httpx

from backend.apps.agents.core.error_classify import (
    CAPACITY_BACKOFFS,
    TRANSIENT_CAPACITY_PATTERNS,
    capacity_retry_wait,
)

# The classifier matches this proxy copy verbatim (a guaranteed-transient signal).
TRANSIENT = "No pool capacity available. Try again shortly."


def test_transient_returns_the_scheduled_backoff_for_each_attempt():
    waits = [capacity_retry_wait(Exception(TRANSIENT), i) for i in range(len(CAPACITY_BACKOFFS))]
    assert waits == CAPACITY_BACKOFFS  # escalates 5 -> 15 -> 45 -> 90 -> 180


def test_budget_exhausted_returns_none():
    assert capacity_retry_wait(Exception(TRANSIENT), len(CAPACITY_BACKOFFS)) is None
    assert capacity_retry_wait(Exception(TRANSIENT), len(CAPACITY_BACKOFFS) + 3) is None


def test_negative_attempt_returns_none():
    assert capacity_retry_wait(Exception(TRANSIENT), -1) is None


def test_non_transient_error_never_retries():
    assert capacity_retry_wait(Exception("invalid_request_error: bad params"), 0) is None
    assert capacity_retry_wait(ValueError("a totally unrelated bug"), 0) is None


def test_transient_signal_can_arrive_only_via_the_stderr_tail():
    # the CLI's ProcessError stringifies to something generic; the real cause is in stderr
    generic = Exception("upstream hiccup")
    assert capacity_retry_wait(generic, 0) is None                      # nothing transient yet
    assert capacity_retry_wait(generic, 0, extra_text=TRANSIENT) == 5   # stderr reveals it


# --- failures that say nothing a word list can read ---------------------------------------------
# Measured live: two browser runs died mid-task on anthropic.APIConnectionError, which stringifies
# to the bare "Connection error." The pattern list scored that NON-transient, so one network blip
# threw away work that was already several steps in. These pin the type-based classification.

def p_req():
    return httpx.Request("POST", "https://api.anthropic.com/v1/messages")


def test_a_bare_connection_error_is_transient():
    exc = anthropic.APIConnectionError(request=p_req())
    assert str(exc) == "Connection error."                    # no code, no ECONNRESET, no wording
    assert not TRANSIENT_CAPACITY_PATTERNS.search(str(exc))   # nothing for the list to match on
    assert capacity_retry_wait(exc, 0) == 5


def test_transport_and_timeout_failures_are_transient():
    for exc in (
        anthropic.APITimeoutError(request=p_req()),
        httpx.ConnectError("nope"),
        httpx.ReadTimeout("nope"),
        httpx.RemoteProtocolError("server disconnected"),
        ConnectionResetError(),
        TimeoutError(),
    ):
        assert capacity_retry_wait(exc, 0) == 5, f"{type(exc).__name__} should retry"


def test_an_auth_failure_stays_non_transient_even_when_it_is_a_transport_type():
    # Retrying a 401 five times burns 335s of backoff and fails anyway, so wording still wins.
    assert capacity_retry_wait(ConnectionError("401 invalid token"), 0) is None


def test_a_transport_error_that_says_nothing_at_all_still_retries():
    # An exception stringifying to "" used to bail out before it was ever classified.
    assert capacity_retry_wait(httpx.ConnectError(""), 0) == 5
