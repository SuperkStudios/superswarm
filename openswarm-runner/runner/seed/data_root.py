"""Lay down the backend's data dir before it boots, so the run is ready on the first tick.

Everything here is written pre-boot on purpose: the workflow store and the settings
store both load from disk once at startup, so seeding files is cheaper and more
deterministic than replaying create/PATCH calls over HTTP (no aux LLM naming call,
no schedule normalization, no chance of the container inventing a second workflow).
"""

import json
import os
import tempfile
from typing import Any, Dict

from typeguard import typechecked

from backend.apps.settings.models import AppSettings
from runner.run_spec import RunSpec

# 9Router provider id -> the AppSettings field the backend reads a raw key from.
API_KEY_SETTINGS_FIELD: Dict[str, str] = {
    "anthropic": "anthropic_api_key",
    "openai": "openai_api_key",
    "gemini": "google_api_key",
    "google": "google_api_key",
    "openrouter": "openrouter_api_key",
}

# One synthetic id for every cloud run. Without it each ephemeral container mints a fresh uuid and analytics sees a brand-new "install" per run.
CLOUD_RUNNER_INSTALLATION_ID = "openswarm-cloud-runner"


@typechecked
def p_write_json(path: str, payload: Any) -> None:
    """Atomic, owner-only write; these files hold API keys."""
    directory = os.path.dirname(path)
    os.makedirs(directory, mode=0o700, exist_ok=True)
    handle, temp_path = tempfile.mkstemp(dir=directory, prefix=".seed-", suffix=".json")
    try:
        with os.fdopen(handle, "w", encoding="utf-8") as stream:
            json.dump(payload, stream, indent=2)
        os.chmod(temp_path, 0o600)
        os.replace(temp_path, path)
    except BaseException:
        if os.path.exists(temp_path):
            os.unlink(temp_path)
        raise


@typechecked
def settings_for_run(spec: RunSpec) -> AppSettings:
    """The AppSettings a cloud run needs: this workflow's model, this run's keys, no telemetry."""
    settings = AppSettings()
    settings.default_model = spec.workflow.model
    settings.connection_mode = "own_key"
    settings.analytics_opt_in = False
    settings.installation_id = CLOUD_RUNNER_INSTALLATION_ID
    for credential in spec.credentials:
        if credential.auth_type != "api_key":
            continue
        field = API_KEY_SETTINGS_FIELD.get(credential.provider)
        if field is None:
            raise ValueError(
                f"no settings field for api_key provider {credential.provider!r}; "
                f"supported: {', '.join(sorted(set(API_KEY_SETTINGS_FIELD)))}"
            )
        setattr(settings, field, credential.api_key)
    return settings


@typechecked
def seed_data_root(data_root: str, spec: RunSpec) -> None:
    """Write the workflow record and the settings file the backend will read at boot."""
    workflow = spec.workflow_for_disk()
    p_write_json(
        os.path.join(data_root, "workflows", f"{workflow.id}.json"),
        workflow.model_dump(mode="json"),
    )
    p_write_json(
        os.path.join(data_root, "settings", "settings.json"),
        settings_for_run(spec).model_dump(mode="json"),
    )
