"""Tell the control plane what happened. The terminal report is the run's only receipt."""

import logging
import time
from typing import List, Literal, Optional

import httpx
from pydantic import BaseModel, ConfigDict, Field
from typeguard import typechecked

from runner.run_spec import CallbackTarget

logger = logging.getLogger(__name__)

TERMINAL_ATTEMPTS = 5
TERMINAL_BACKOFF_SECONDS = 2.0
REQUEST_TIMEOUT_SECONDS = 15.0


class RunReport(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    run_id: str
    phase: Literal["started", "heartbeat", "finished"]
    status: str
    exit_code: Optional[int] = None
    error: Optional[str] = None
    cost_usd: float = 0.0
    active_step_idx: Optional[int] = None
    last_tool_label: Optional[str] = None
    answer: str = ""
    transcript: str = ""
    # The backend calls a run "success" even when the provider rejected the token; these are how the control plane sees that.
    system_notices: List[str] = Field(default_factory=list)


@typechecked
def p_post_once(callback: CallbackTarget, report: RunReport) -> bool:
    try:
        with httpx.Client(timeout=REQUEST_TIMEOUT_SECONDS) as client:
            response = client.post(
                callback.url,
                headers={"Authorization": f"Bearer {callback.token}"},
                json=report.model_dump(mode="json"),
            )
        if response.status_code < 300:
            return True
        logger.warning("report %s rejected with HTTP %s", report.phase, response.status_code)
        return False
    except httpx.HTTPError as exc:
        logger.warning("report %s failed to send: %s", report.phase, exc)
        return False


@typechecked
def send_report(callback: Optional[CallbackTarget], report: RunReport) -> bool:
    """Post a report. Terminal reports retry; heartbeats get one shot and are never retried."""
    if callback is None:
        logger.info("no callback configured; %s report kept local: %s", report.phase, report.status)
        return True
    if report.phase != "finished":
        return p_post_once(callback, report)
    for attempt in range(TERMINAL_ATTEMPTS):
        if p_post_once(callback, report):
            return True
        if attempt + 1 < TERMINAL_ATTEMPTS:
            time.sleep(TERMINAL_BACKOFF_SECONDS * (attempt + 1))
    logger.error("terminal report for run %s never landed after %d attempts", report.run_id, TERMINAL_ATTEMPTS)
    return False
