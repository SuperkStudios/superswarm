"""One workflow run, one container, one exit code.

Boots the backend headless, executes the workflow the control plane asked for,
reports the result, and dies. Nothing here is meant to survive the run.
"""

import logging
import os
import subprocess
import sys
import threading
import time
from datetime import datetime, timezone
from typing import Optional

from pydantic import BaseModel, ConfigDict
from typeguard import typechecked

from runner.boot.backend_process import BackendProcess, BackendUnavailable, start_backend, stop_backend
from runner.boot.renderer_process import RendererProcess, RendererUnavailable, start_renderer, stop_renderer
from runner.report import RunReport, send_report
from runner.run_spec import CLOUD_RUN_DASHBOARD_ID, CallbackTarget, InvalidRunSpec, RunSpec, load_run_spec
from runner.seed.data_root import seed_data_root
from runner.seed.router_credentials import write_router_db
from runner.workflow_run import RunOutcome, RunProgress, WorkflowRunFailed, execute_workflow

EXIT_OK = 0
EXIT_INTERNAL = 1
EXIT_BAD_SPEC = 2
EXIT_CREDENTIAL_EXPIRED = 3
EXIT_BACKEND_UNAVAILABLE = 4
EXIT_WORKFLOW_FAILED = 5
EXIT_DEADLINE = 6
EXIT_RENDERER_UNAVAILABLE = 7

DEFAULT_APP_ROOT = "/app"
DEFAULT_FRONTEND_DIR = "/app/frontend"
DEFAULT_DATA_ROOT = "/data/openswarm"
DEFAULT_ROUTER_DATA_DIR = "/data/9router"
DEFAULT_PORT = 8324
# Slack between the soft deadline (stop the run, report it) and the hard one (kill the process).
REPORT_GRACE_SECONDS = 90.0
# Ceiling the control plane cannot raise. A cap a caller can override is not a cap.
MAX_RUN_SECONDS_ENV = "RUNNER_MAX_RUN_SECONDS"
DEFAULT_MAX_RUN_SECONDS = 1800

logger = logging.getLogger("runner")


class Heartbeat(BaseModel):
    model_config = ConfigDict(validate_assignment=True)

    run_id: str
    interval_seconds: float
    callback: Optional[CallbackTarget] = None
    last_sent: float = 0.0

    @typechecked
    def maybe_send(self, progress: RunProgress) -> None:
        now = time.monotonic()
        if now - self.last_sent < self.interval_seconds:
            return
        self.last_sent = now
        send_report(self.callback, RunReport(
            run_id=self.run_id,
            phase="heartbeat",
            status=progress.status,
            active_step_idx=progress.active_step_idx,
            last_tool_label=progress.last_tool_label,
        ))


@typechecked
def effective_max_run_seconds(spec: RunSpec) -> int:
    """The shorter of what the job asked for and what this machine's config allows."""
    try:
        ceiling = int(os.environ.get(MAX_RUN_SECONDS_ENV, "") or DEFAULT_MAX_RUN_SECONDS)
    except ValueError:
        ceiling = DEFAULT_MAX_RUN_SECONDS
    return max(60, min(spec.max_run_seconds, ceiling))


@typechecked
def arm_hard_stop(seconds: float) -> None:
    """Independent backstop on machine-seconds; fires even if the graceful path is wedged."""
    def p_fire() -> None:
        time.sleep(seconds)
        logger.error("hard wall-clock stop after %.0fs, killing the run", seconds)
        os._exit(EXIT_DEADLINE)

    threading.Thread(target=p_fire, daemon=True, name="hard-stop").start()


@typechecked
def p_fail(spec: Optional[RunSpec], status: str, message: str, code: int) -> int:
    logger.error("%s: %s", status, message)
    send_report(
        spec.callback if spec else None,
        RunReport(
            run_id=spec.run_id if spec else "unknown",
            phase="finished",
            status=status,
            exit_code=code,
            error=message,
        ),
    )
    return code


@typechecked
def p_exit_code_for(outcome: RunOutcome) -> int:
    if outcome.status in ("success", "ran_late"):
        return EXIT_OK
    if outcome.status == "timed_out":
        return EXIT_DEADLINE
    return EXIT_WORKFLOW_FAILED


@typechecked
def p_run(spec: RunSpec, deadline: float) -> int:
    now = datetime.now(timezone.utc)
    expired = spec.expired_credentials(now)
    if expired:
        names = ", ".join(credential.provider for credential in expired)
        return p_fail(
            spec,
            "failure",
            f"access token for {names} is expired or about to expire; the runner never refreshes, "
            "so the control plane must re-issue it",
            EXIT_CREDENTIAL_EXPIRED,
        )

    app_root = os.environ.get("OPENSWARM_APP_ROOT", DEFAULT_APP_ROOT)
    data_root = os.environ.get("OPENSWARM_DATA_ROOT", DEFAULT_DATA_ROOT)
    router_data_dir = os.environ.get("DATA_DIR", DEFAULT_ROUTER_DATA_DIR)
    port = int(os.environ.get("OPENSWARM_PORT", str(DEFAULT_PORT)))

    write_router_db(router_data_dir, spec.credentials, now)
    seed_data_root(data_root, spec)
    logger.info("seeded data root %s and router db in %s", data_root, router_data_dir)

    backend: Optional[BackendProcess] = None
    process: Optional[subprocess.Popen] = None
    renderer: Optional[RendererProcess] = None
    try:
        backend = start_backend(app_root, data_root, port, deadline)
        process = backend.process
        logger.info("backend healthy at %s", backend.base_url)

        if spec.needs_browser:
            renderer = start_renderer(
                app_root=app_root,
                frontend_dir=os.environ.get("OPENSWARM_FRONTEND_DIR", DEFAULT_FRONTEND_DIR),
                backend_base_url=backend.base_url,
                backend_headers=backend.headers(),
                backend_port=port,
                dashboard_id=CLOUD_RUN_DASHBOARD_ID,
                deadline=deadline,
            )
            logger.info("renderer attached at %s, browser tools are live", renderer.url)

        send_report(spec.callback, RunReport(run_id=spec.run_id, phase="started", status="running"))
        heartbeat = Heartbeat(
            run_id=spec.run_id,
            interval_seconds=float(spec.callback.heartbeat_seconds) if spec.callback else 30.0,
            callback=spec.callback,
        )
        outcome = execute_workflow(backend, spec.workflow.id, deadline, heartbeat.maybe_send)
    except BackendUnavailable as exc:
        return p_fail(spec, "failure", str(exc), EXIT_BACKEND_UNAVAILABLE)
    except RendererUnavailable as exc:
        # Loud, not silent: a browser workflow that quietly ran without a window produces a
        # confident wrong answer, which is worse than no answer.
        return p_fail(spec, "failure", str(exc), EXIT_RENDERER_UNAVAILABLE)
    except WorkflowRunFailed as exc:
        return p_fail(spec, "failure", str(exc), EXIT_WORKFLOW_FAILED)
    finally:
        stop_renderer(renderer)
        stop_backend(process)

    code = p_exit_code_for(outcome)
    logger.info("run %s finished as %s (exit %d)", spec.run_id, outcome.status, code)
    send_report(spec.callback, RunReport(
        run_id=spec.run_id,
        phase="finished",
        status=outcome.status,
        exit_code=code,
        error=outcome.error,
        cost_usd=outcome.cost_usd,
        answer=outcome.answer,
        transcript=outcome.transcript,
        system_notices=outcome.system_notices,
    ))
    return code


@typechecked
def main() -> int:
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s %(levelname).1s %(name)s: %(message)s",
        datefmt="%H:%M:%S",
    )
    try:
        spec = load_run_spec()
    except InvalidRunSpec as exc:
        return p_fail(None, "failure", str(exc), EXIT_BAD_SPEC)

    budget = effective_max_run_seconds(spec)
    arm_hard_stop(budget + REPORT_GRACE_SECONDS)
    deadline = time.monotonic() + budget
    try:
        return p_run(spec, deadline)
    except Exception as exc:
        logger.exception("runner crashed")
        return p_fail(spec, "failure", f"runner crashed: {exc}", EXIT_INTERNAL)


if __name__ == "__main__":
    sys.exit(main())
