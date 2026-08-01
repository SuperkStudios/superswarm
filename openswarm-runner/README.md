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

The app exists and is created onto its own isolated private network. Read `fly.toml`'s
header before touching it; the network is fixed at create time and cannot be changed
by a redeploy.

```bash
# from the REPO ROOT, the image needs backend/ in its build context
fly deploy . --app openswarm-runner --config openswarm-runner/fly.toml \
  --dockerfile openswarm-runner/Dockerfile --image-label latest --ha=false
```

`--image-label latest` is load-bearing: the control plane creates machines from the
fixed tag `registry.fly.io/openswarm-runner:latest`, so a redeploy without it ships an
image nothing will ever boot. Re-verify the isolation after any deploy, do not assume
it survived:

```bash
fly machine run registry.fly.io/openswarm-runner:latest -a openswarm-runner \
  --entrypoint /bin/sleep --restart no --vm-memory 512 --vm-cpus 1 600
fly ssh console -a openswarm-runner --machine <id> -C "getent hosts openswarm-cloud.internal"
# must print nothing and exit 2. Then destroy the probe machine.
```

The deploy leaves one stopped template machine with no run spec. That is expected; it
exits 2 immediately and `[[restart]] policy = 'never'` stops it looping.

## How a run gets here

`openswarm-cloud` creates one machine per due workflow through the Fly Machines API
(`workflows/dispatch.ts`). It never uses `fly deploy` for a run, so this app's env is
whatever the IMAGE carries plus `OPENSWARM_RUN_SPEC_FILE`; `fly.toml`'s settings do not
reach a per-run machine. Control-plane side that means:

| env on openswarm-cloud | why |
| --- | --- |
| `FLY_API_TOKEN` | app-scoped deploy token for `openswarm-runner`, nothing wider |
| `RUN_CALLBACK_BASE_URL` | where the runner reports; **no default**, so a staging control plane can never point its machines at prod |
| `RUNNER_APP` / `RUNNER_IMAGE` / `RUNNER_REGION` | optional overrides of `openswarm-runner` / the `:latest` tag / `iad` |
