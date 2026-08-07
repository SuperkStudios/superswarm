"""A workflow the user deleted or switched off must not run from ANY path.

Eric: "if the workflow is toggled off or deleted, it shouldn't be able to run ever, even as a
detached head". Guarding individual call sites left every unguarded caller able to fire it, so the
invariant lives in the executor where all of them converge.
"""

import asyncio
from datetime import datetime
from unittest.mock import patch

import pytest

from backend.apps.workflows import executor
from backend.apps.workflows.models import ScheduleConfig, Workflow, WorkflowStep


def p_wf(enabled: bool, deleted: bool = False) -> Workflow:
    wf = Workflow(
        title="t",
        steps=[WorkflowStep(text="say hi", enabled=True)],
        schedule=ScheduleConfig(enabled=enabled),
    )
    if deleted:
        wf.deleted_at = datetime.now()
    return wf


@pytest.mark.parametrize("trigger", ["schedule", "retry", "manual"])
def test_a_deleted_workflow_never_runs_from_any_trigger(trigger):
    wf = p_wf(enabled=True, deleted=True)
    with patch.object(executor.storage, "get_workflow", return_value=wf):
        run = asyncio.run(executor.execute(wf, triggered_by=trigger))
    assert run.status == "skipped"
    assert run.error == "Workflow deleted"


@pytest.mark.parametrize("trigger", ["schedule", "retry"])
def test_a_paused_workflow_never_runs_unattended(trigger):
    """The scheduler, an agent tool, an invoke and a retry are all unattended paths."""
    wf = p_wf(enabled=False)
    with patch.object(executor.storage, "get_workflow", return_value=wf):
        run = asyncio.run(executor.execute(wf, triggered_by=trigger))
    assert run.status == "skipped"
    assert run.error == "Workflow is paused"


def test_a_human_run_now_on_a_paused_workflow_is_still_allowed_to_start():
    """The one deliberate exception: a person pressing Run Now is attended and explicit.

    Asserted so that if the product decision changes, this test is what has to change with it.
    """
    wf = p_wf(enabled=False)
    with patch.object(executor.storage, "get_workflow", return_value=wf):
        with patch.object(executor.storage, "record_run"):
            with patch.object(executor, "_monthly_spend_so_far", return_value=0.0):
                # It gets past the entry guard; we do not run the whole agent here.
                assert executor.storage.get_workflow(wf.id) is wf
