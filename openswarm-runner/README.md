# openswarm-runner

One ephemeral Linux container that executes ONE OpenSwarm workflow run and exits.
One Fly Firecracker machine per run, no state kept.

## Build

The build context is the **repo root**, not this directory (the image needs `backend/`
and `backend/requirements.lock`):

```bash
docker build --platform linux/amd64 -f openswarm-runner/Dockerfile -t openswarm-runner .
```

## Run

The container is told everything it needs by one JSON run spec in `OPENSWARM_RUN_SPEC`
(or a path in `OPENSWARM_RUN_SPEC_FILE`). See `runner/run_spec.py` for the typed shape.

```json
{
  "run_id": "cr_01J...",
  "workflow": { "id": "wf_1", "title": "Daily digest", "model": "opus-5",
                "steps": [{ "text": "summarize my inbox" }] },
  "credentials": [
    { "provider": "claude", "auth_type": "oauth",
      "access_token": "<already refreshed by the control plane>",
      "expires_at": "2026-07-31T20:00:00Z" }
  ],
  "callback": { "url": "https://api.openswarm.com/api/cloud-runs/cr_01J.../report",
                "token": "<two-party runner token, not a user credential>" },
  "max_run_seconds": 1800
}
```

Exit codes: `0` ok, `1` runner crash, `2` bad spec, `3` credential expired on arrival,
`4` backend never came up, `5` workflow failed, `6` wall-clock cap hit.

## The credential rule

**A `providerConnections[]` entry this runner writes never contains a `refreshToken`.**
9Router's refresh dispatcher bails on `if (!b || !b.refreshToken) return null`, so
omitting the field is what makes the container incapable of rotating the user's grant.
If it ever rotated, the user's laptop would be left replaying a dead token and the
provider would revoke the whole grant family.

Two independent walls enforce it, and a third makes a leak require deleting the code
that builds the entry:

1. `ProviderCredential` forbids extra fields, so a spec carrying `refreshToken` fails
   validation before the backend boots.
2. `assert_no_refresh_token` re-reads the assembled db payload just before the write.
3. `router_connection` assembles the entry from a fixed key list, never a passthrough.

All three live in `runner/seed/router_credentials.py`.

An access token that arrives expired fails the run (exit 3). The runner never refreshes.

## Test

```bash
PYTHONPATH=.:openswarm-runner backend/.venv/bin/python3 -m pytest openswarm-runner/tests -q
```

## Deploy

Not deployed. `fly.toml` is written but never applied; read its header first, the app
has to be created onto its own isolated private network by hand before any deploy.
