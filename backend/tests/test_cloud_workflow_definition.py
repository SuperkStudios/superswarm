"""What we are willing to hand the cloud, and which schedules it can honour at all.

Both are pure functions, and both decide something a user reads: a schedule the cloud cannot
express has to be refused in words rather than rounded off, and the copy we push must not carry
anything local (session ids, a phone number) off this machine.
"""
from backend.apps.workflows.cloud.definition import cloud_definition, definition_signature
from backend.apps.workflows.cloud.schedule import ScheduleSupported, ScheduleUnsupported, to_cloud_schedule
from backend.apps.workflows.models import PermissionTier, ScheduleConfig, Workflow, WorkflowStep


def p_sched(**overrides) -> ScheduleConfig:
    base = dict(enabled=True, repeat_unit="day", repeat_every=1, hour=9, minute=0, timezone="UTC")
    base.update(overrides)
    return ScheduleConfig(**base)


def p_wf(**overrides) -> Workflow:
    base = dict(title="Morning digest", steps=[WorkflowStep(text="summarize the news")], schedule=p_sched())
    base.update(overrides)
    return Workflow(**base)


def test_only_daily_and_interval_schedules_map_to_the_cloud():
    assert isinstance(to_cloud_schedule(p_sched()), ScheduleSupported)
    assert isinstance(to_cloud_schedule(p_sched(repeat_unit="minute", repeat_every=30)), ScheduleSupported)
    assert isinstance(to_cloud_schedule(p_sched(repeat_unit="hour", repeat_every=6)), ScheduleSupported)
    for unsupported in (
        p_sched(repeat_unit="week", on_days=[1]),
        p_sched(repeat_unit="month", day_of_month=1),
        p_sched(repeat_unit="day", repeat_every=3),
        p_sched(max_runs=5),
    ):
        mapping = to_cloud_schedule(unsupported)
        assert isinstance(mapping, ScheduleUnsupported)
        # The reason is shown to a person verbatim, so it has to read like one wrote it.
        assert mapping.reason.endswith(".") and " " in mapping.reason


def test_a_9am_wall_clock_becomes_the_right_utc_time():
    mapping = to_cloud_schedule(p_sched(hour=9, minute=30, timezone="Asia/Tokyo"))
    assert isinstance(mapping, ScheduleSupported)
    assert mapping.schedule.model_dump() == {"kind": "daily", "hour_utc": 0, "minute_utc": 30}


def test_the_cloud_copy_carries_no_local_secrets_and_no_live_timer():
    wf = p_wf(
        permissions=[PermissionTier(kind="text", after_minutes=5, phone="+15550001111")],
        edit_agent_session_id="session-abc",
        source_session_id="session-def",
    )
    body = cloud_definition(wf)
    assert "permissions" not in body, "the escalation tiers carry a phone number and cannot ring from a container"
    for leaked in ("edit_agent_session_id", "source_session_id", "last_run_id", "dashboard_id"):
        assert leaked not in body
    assert body["schedule"]["enabled"] is False
    assert body["steps"][0]["text"] == "summarize the news"


def test_a_signature_tracks_edits_and_ignores_the_clock():
    wf = p_wf()
    schedule = {"kind": "daily", "hour_utc": 9, "minute_utc": 0}
    first = definition_signature(cloud_definition(wf), schedule)

    wf.title = wf.title
    assert definition_signature(cloud_definition(wf), schedule) == first, "a save with no edit is not a drift"

    wf.steps = [WorkflowStep(id=wf.steps[0].id, text="summarize the sports news")]
    assert definition_signature(cloud_definition(wf), schedule) != first
    assert definition_signature(cloud_definition(wf), {"kind": "interval", "minutes": 60}) != first
