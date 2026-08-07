"""The flight recorder's contract: cheap crumbs, bounded rings, envelopes that name everything,
and a near-miss ledger that counts silent recoveries."""

import time

from backend.apps.agents.core import flight_recorder as fr


def test_ring_is_bounded_and_ordered():
    sid = "t-ring"
    fr.drop_session(sid)
    for i in range(100):
        fr.crumb(sid, "step", n=i)
    crumbs = fr.breadcrumbs(sid, last=100)
    assert len(crumbs) == 64, "ring must cap at 64"
    assert crumbs[-1]["n"] == 99 and crumbs[0]["n"] == 36, "oldest drop first"
    fr.drop_session(sid)
    assert fr.breadcrumbs(sid) == []


def test_meta_values_are_truncated_and_typed():
    sid = "t-meta"
    fr.drop_session(sid)
    fr.crumb(sid, "err", msg="x" * 999, count=3, flag=True, skipped=None)
    c = fr.breadcrumbs(sid)[0]
    assert len(c["msg"]) == 200 and c["count"] == 3 and c["flag"] is True and "skipped" not in c
    fr.drop_session(sid)


def test_lane_classification_matches_the_routing_reality():
    assert fr.lane_for_model("sonnet-cc") == "cc"
    assert fr.lane_for_model("cx/gpt-5.2") == "cx"
    assert fr.lane_for_model("gemini-2.5-pro") == "gc"
    assert fr.lane_for_model("openrouter/meta/llama") == "openrouter"
    assert fr.lane_for_model("cp-openai/local") == "custom"
    assert fr.lane_for_model("sonnet") == "api"
    assert fr.lane_for_model(None) == "api"


def test_envelope_carries_cause_context_and_crumbs():
    sid = "t-env"
    fr.drop_session(sid)
    fr.crumb(sid, "router-retry", attempt=1)

    class FakeSession:
        status = "running"

    env = fr.build_envelope(sid, "model_error", "unclassified", "sonnet-cc", "stream", 2, {"a": FakeSession(), "b": FakeSession()})
    assert env["family"] == "model_error" and env["lane"] == "cc" and env["phase"] == "stream"
    assert env["attempts"] == 2 and env["breadcrumbs"][0]["l"] == "router-retry"
    assert env["concurrency"] == {"sessions_total": 2, "turns_running": 2}
    fr.drop_session(sid)


def test_recovery_ledger_emits_a_countable_diagnostic(monkeypatch):
    sent = []
    import backend.apps.service.client as svc
    monkeypatch.setattr(svc, "submit_diagnostic", lambda d: sent.append(d))
    fr.record_recovery("t-rec-12345678", "router-resume", "sonnet-cc", 1, None)
    assert len(sent) == 1
    d = sent[0]
    assert d["kind"] == "recovered" and d["subkind"] == "router-resume" and d["lane"] == "cc" and d["attempts"] == 1
    fr.drop_session("t-rec-12345678")
