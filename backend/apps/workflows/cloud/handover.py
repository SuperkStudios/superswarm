"""Moving one workflow's timer between this machine and our servers.

Exactly one of the two may be armed at any moment. `execution_target` flips to
"cloud" only once the cloud has taken the workflow, and back to "device" only
once the cloud has let it go, so the window where both would fire does not
exist. Every caller that stops a workflow (the toggle, Trash, purge) goes
through take_back for the same reason.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict
from typeguard import typechecked

from backend.apps.workflows import scheduler, storage
from backend.apps.workflows.cloud import client as cloud
from backend.apps.workflows.cloud.definition import cloud_definition, definition_signature
from backend.apps.workflows.cloud.schedule import ScheduleSupported, to_cloud_schedule
from backend.apps.workflows.cloud.status import epoch_to_datetime
from backend.apps.workflows.models import Workflow

logger = logging.getLogger(__name__)

SIGN_IN_MESSAGE = "Sign in to your OpenSwarm account to run workflows in the cloud."
UNREACHABLE_UP = (
    "Couldn't reach the cloud, so nothing was scheduled there. "
    "This workflow still runs on this device. Try again in a moment."
)
UNREACHABLE_DOWN = (
    "Couldn't reach the cloud to stop the cloud schedule, so nothing changed. "
    "It keeps running in the cloud until this goes through."
)


class TargetOutcome(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    ok: bool
    # Present only when ok is false, and written for the user: usually the cloud's own words.
    message: Optional[str] = None


@typechecked
async def hand_to_cloud(wf: Workflow, enabled: bool) -> TargetOutcome:
    mapping = to_cloud_schedule(wf.schedule)
    if not isinstance(mapping, ScheduleSupported):
        return TargetOutcome(ok=False, message=mapping.reason)
    if enabled and not scheduler.is_schedule_configured(wf.schedule):
        return TargetOutcome(ok=False, message="Finish setting up the schedule before choosing where it runs.")
    definition = cloud_definition(wf)
    try:
        hosted = await cloud.put_workflow(
            hosted_id=wf.cloud_workflow_id,
            name=wf.title or "Workflow",
            definition=definition,
            schedule=mapping.schedule,
        )
        if hosted.enabled != enabled:
            hosted = await cloud.set_enabled(hosted.id, enabled)
    except cloud.SignedOut:
        return TargetOutcome(ok=False, message=SIGN_IN_MESSAGE)
    except cloud.CloudRefused as exc:
        return TargetOutcome(ok=False, message=exc.message)
    except cloud.CloudUnreachable as exc:
        logger.info("cloud workflow push unreachable for %s: %s", wf.id, exc.detail)
        return TargetOutcome(ok=False, message=UNREACHABLE_UP)

    wf.execution_target = "cloud"
    wf.cloud_workflow_id = hosted.id
    wf.cloud_definition_signature = definition_signature(definition, mapping.schedule.model_dump())
    wf.schedule.enabled = enabled
    wf.next_run_at = epoch_to_datetime(hosted.next_run_at) if enabled else None
    wf.updated_at = datetime.now()
    storage.save_workflow(wf)
    scheduler.kick()
    return TargetOutcome(ok=True)


@typechecked
async def take_back(wf: Workflow, enabled: bool) -> TargetOutcome:
    if wf.cloud_workflow_id:
        try:
            await cloud.delete_hosted(wf.cloud_workflow_id)
        except cloud.SignedOut:
            # Signed out means the cloud copy is unreachable, not gone; arming our timer here would double-fire it.
            return TargetOutcome(ok=False, message=SIGN_IN_MESSAGE)
        except cloud.CloudRefused as exc:
            return TargetOutcome(ok=False, message=exc.message)
        except cloud.CloudUnreachable as exc:
            logger.info("cloud workflow delete unreachable for %s: %s", wf.id, exc.detail)
            return TargetOutcome(ok=False, message=UNREACHABLE_DOWN)

    wf.execution_target = "device"
    wf.cloud_workflow_id = None
    wf.cloud_definition_signature = None
    wf.schedule.enabled = enabled and scheduler.is_schedule_configured(wf.schedule)
    wf.next_run_at = scheduler.compute_next_fire(wf) if wf.schedule.enabled else None
    wf.updated_at = datetime.now()
    storage.save_workflow(wf)
    scheduler.kick()
    return TargetOutcome(ok=True)


@typechecked
async def release_before_removing(wf: Workflow) -> TargetOutcome:
    """Take the cloud copy down before a workflow disappears from this machine.
    Trash and purge both call it: a hosted row nobody can see any more still
    runs on its own schedule, and still costs the user money."""
    if wf.execution_target != "cloud" and not wf.cloud_workflow_id:
        return TargetOutcome(ok=True)
    return await take_back(wf, False)
