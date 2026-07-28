"""redact_for_telemetry is the wall between a model_error diagnostic and a key
leak: in own_key mode the subprocess stderr we now attach can echo the user's
provider key, so these tests pin that no secret shape survives while the actual
error text (the whole point of capturing stderr) does.

The secret-shaped inputs are built by concatenation on purpose: no contiguous
key-shaped literal lands in this source file (so it never trips gitleaks or
alarms a reader), yet the runtime values are still key-shaped enough to exercise
the scrub. None of these are real keys; they unlock nothing."""
import asyncio

from backend.apps.agents.core.error_classify import (
    capacity_retry_wait,
    is_auth_error,
    is_cli_binary_missing,
    is_free_trial_exhausted,
    is_transient_capacity_error,
    is_unknown_model_error,
    redact_for_telemetry,
)
from backend.apps.agents.core.first_real_exception import first_real_exception

# Verbatim field strings from prod analytics (2026-07): the exact shapes users hit.
P_FIELD_POOL_BUSY = (
    "Error code: 429 - {'type': 'error', 'error': {'type': 'free_pool_busy', "
    "'message': \"OpenSwarm's free pool is busy right now. Sign in for more, or try again shortly.\"}}"
)
P_FIELD_CLI_MISSING = (
    "Claude Code not found at: C:\\Users\\Rishi\\AppData\\Local\\openswarm\\app-1.5.6\\resources"
    "\\python-env\\Lib\\site-packages\\claude_agent_sdk\\_bundled\\claude.exe"
)


def test_redacts_provider_key_shapes_keeps_context():
    anthropic = "sk-" + "ant-" + "A" * 28
    openai = "sk-" + "B" * 24
    google = "AIza" + "C" * 30
    github = "ghp" + "_" + "D" * 24
    s = f"9router: invalid x-api-key {anthropic} {openai} {google} {github}"
    out = redact_for_telemetry(s)
    for secret in (anthropic, openai, google, github):
        assert secret not in out
    assert "[redacted]" in out
    # The diagnostic signal survives, that's the reason we capture stderr at all.
    assert "9router: invalid x-api-key" in out


def test_redacts_bearer_and_key_value():
    bearer_token = "E" * 24
    kv_value = "F" * 16
    s = "Authorization: " + "Bearer " + bearer_token + "\n" + "api_key=" + kv_value
    out = redact_for_telemetry(s)
    assert bearer_token not in out
    assert kv_value not in out


def test_keeps_tail_and_bounds_length():
    # The real error lands at the end of the stderr stream, so we keep the tail.
    s = "old noise\n" * 500 + "Command failed: ENOENT spawn 9router"
    out = redact_for_telemetry(s, limit=120)
    assert len(out) <= 120
    assert "Command failed: ENOENT spawn 9router" in out


def test_empty_is_safe():
    assert redact_for_telemetry("") == ""


def test_field_pool_busy_is_transient_and_retried():
    e = Exception(P_FIELD_POOL_BUSY)
    assert is_transient_capacity_error(e)
    assert capacity_retry_wait(e, 0) == 5
    # Must not be claimed by the branches that would surface a card instead of retrying.
    assert not is_free_trial_exhausted(e)
    assert not is_auth_error(e)


def test_cli_missing_matches_field_string_and_nothing_else_claims_it():
    e = Exception(P_FIELD_CLI_MISSING)
    assert is_cli_binary_missing(e)
    assert not is_transient_capacity_error(e)
    assert not is_auth_error(e)
    assert not is_unknown_model_error(e)


def test_cli_missing_matches_sdk_exception_type():
    class CLINotFoundError(Exception):
        pass
    assert is_cli_binary_missing(CLINotFoundError("whatever text"))


def test_first_real_exception_unwraps_nested_groups():
    boom = ValueError("boom")
    group = BaseExceptionGroup(
        "outer", [asyncio.CancelledError(), ExceptionGroup("inner", [boom])]
    )
    assert first_real_exception(group) is boom


def test_first_real_exception_all_cancelled_is_none():
    group = BaseExceptionGroup("outer", [asyncio.CancelledError()])
    assert first_real_exception(group) is None


def test_first_real_exception_plain_passthrough():
    boom = RuntimeError("x")
    assert first_real_exception(boom) is boom
