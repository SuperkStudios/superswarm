"""Map a local schedule onto the cloud scheduler's much smaller vocabulary.

The cloud speaks two cadences: repeat every N minutes, or once a day at a UTC
time. Everything else this app can express (set weekdays, monthly, every third
day, stop after N runs) has no cloud equivalent, and silently rounding one of
them off would fire a workflow on days the user never picked. So anything that
does not map exactly is refused here, in the user's own words, and stays on
their machine where it already works.
"""
from __future__ import annotations

from datetime import datetime
from typing import Literal, Optional, Union
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict
from typeguard import typechecked

from backend.apps.workflows.models import ScheduleConfig
from backend.apps.workflows.scheduler import host_timezone_name

CADENCE_PREFIX = "Cloud runs repeat on an interval or once a day."


class CloudIntervalSchedule(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    kind: Literal["interval"] = "interval"
    minutes: int


class CloudDailySchedule(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    kind: Literal["daily"] = "daily"
    hour_utc: int
    minute_utc: int


CloudSchedule = Union[CloudIntervalSchedule, CloudDailySchedule]


class ScheduleSupported(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    supported: Literal[True] = True
    schedule: CloudSchedule


class ScheduleUnsupported(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    supported: Literal[False] = False
    reason: str


ScheduleMapping = Union[ScheduleSupported, ScheduleUnsupported]


@typechecked
def p_zone(name: str) -> ZoneInfo:
    if not name or name == "local":
        name = host_timezone_name()
    try:
        return ZoneInfo(name)
    except ZoneInfoNotFoundError:
        return ZoneInfo("UTC")


@typechecked
def p_utc_time_of_day(sched: ScheduleConfig, ref: Optional[datetime] = None) -> CloudDailySchedule:
    """The user's wall-clock time expressed in UTC, using today's offset."""
    zone = p_zone(sched.timezone)
    local = (ref or datetime.now(zone)).astimezone(zone)
    at = local.replace(hour=sched.hour, minute=sched.minute, second=0, microsecond=0)
    utc = at.astimezone(ZoneInfo("UTC"))
    return CloudDailySchedule(hour_utc=utc.hour, minute_utc=utc.minute)


@typechecked
def to_cloud_schedule(sched: ScheduleConfig) -> ScheduleMapping:
    if sched.max_runs is not None:
        return ScheduleUnsupported(
            reason=(
                f"This schedule stops itself after {sched.max_runs} "
                f"run{'' if sched.max_runs == 1 else 's'}, and the cloud scheduler cannot count down "
                "to a stop. Remove the limit to run it in the cloud."
            ),
        )
    if sched.ends_at is not None:
        return ScheduleUnsupported(
            reason=(
                "This schedule has an end date, and the cloud scheduler cannot honour one. "
                "Remove the end date to run it in the cloud."
            ),
        )
    if sched.repeat_unit == "minute":
        return ScheduleSupported(schedule=CloudIntervalSchedule(minutes=max(5, sched.repeat_every)))
    if sched.repeat_unit == "hour":
        return ScheduleSupported(schedule=CloudIntervalSchedule(minutes=max(5, sched.repeat_every * 60)))
    if sched.repeat_unit == "day" and sched.repeat_every == 1:
        return ScheduleSupported(schedule=p_utc_time_of_day(sched))
    if sched.repeat_unit == "day":
        return ScheduleUnsupported(
            reason=(
                f"{CADENCE_PREFIX} This one runs every {sched.repeat_every} days at a set time, "
                "which the cloud scheduler cannot do yet, so it stays on this device."
            ),
        )
    if sched.repeat_unit == "week":
        return ScheduleUnsupported(
            reason=(
                f"{CADENCE_PREFIX} This one runs on the weekdays you picked, "
                "which the cloud scheduler cannot do yet, so it stays on this device."
            ),
        )
    return ScheduleUnsupported(
        reason=(
            f"{CADENCE_PREFIX} This one runs monthly, "
            "which the cloud scheduler cannot do yet, so it stays on this device."
        ),
    )
