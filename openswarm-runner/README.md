# openswarm-runner

One ephemeral Linux container that executes ONE OpenSwarm workflow run and exits.
One Fly Firecracker machine per run, no state kept.

## Build

The build context is the **repo root**, not this directory (the image needs `backend/`,
`electron/`, `frontend/` and `backend/requirements.lock`). **amd64 only**, see the
renderer section:

```bash
docker build --platform linux/amd64 -f openswarm-runner/Dockerfile -t openswarm-runner .
```

Nothing has to be built on the host first: the frontend bundle and the shell's node
modules are built in their own stages inside the image.

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
  "max_run_seconds": 1800,
  "needs_browser": true
}
```

Exit codes: `0` ok, `1` runner crash, `2` bad spec, `3` credential expired on arrival,
`4` backend never came up, `5` workflow failed, `6` wall-clock cap hit,
`7` no Electron window ever registered.

## The renderer

OpenSwarm's browser tier is not an HTTP client. Element serialization and every click,
type and scroll live in `frontend/src/shared/browserCommandHandler.ts` and drive a live
Electron `<webview>`; the backend only relays commands over the dashboard WebSocket. So
the container runs **the real desktop shell**, unmodified, on a virtual display:

```
Xvfb :99 -> Electron (ELECTRON_DEV=1, OPENSWARM_DEV_URL=<bundle>#/dashboard/cloud-run)
         -> registers on /ws/dashboard -> browser tools are live
```

`ELECTRON_DEV=1` is the same path `bash run.sh` uses: the shell attaches to the backend
already running here instead of spawning a second one. The bundle is served off loopback
on `:4173`, the same port the packaged app prefers, and deep-linked at the run's one
dashboard so no human has to click anything.

Three things follow from this and are worth knowing before you touch it:

- **amd64 only.** CastLabs (whose Electron the desktop app ships) publishes no
  linux-arm64 build. Running a *different* Electron in the cloud than users run on their
  laptops would quietly undo the point of the image, so the build refuses other arches.
- **`--no-sandbox`.** Chromium's setuid sandbox needs a root-owned binary and its
  namespace sandbox needs unprivileged user namespaces; a non-root container under
  Docker's default seccomp has neither. The wall this run relies on is the Firecracker VM
  around the whole container, not Chromium's own layer. The flag lives in a named constant
  in `runner/renderer_process.py` rather than inside a launch string, on purpose.
- **`needs_browser: false` skips it.** Boot costs roughly 15s and ~500MB of the run's
  memory, so a workflow that never opens a page can opt out. Default is on: parity is the
  reason this image exists, and opting out should be the thing you have to say.

If Electron starts but no window ever registers, the run **fails** (exit 7) rather than
proceeding without a browser. A browser workflow that silently ran blind produces a
confident wrong answer, which is worse than no answer.

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

The Electron boot itself needs Linux and a display, so the tests pin the contract around
it (the deep link, the bundle check, the three ways "no window" ends) rather than the
boot. Proving the browser tier actually behaves means running a real page in both places
and comparing; see the parity matrix in the cloud-browser work notes.

## Deploy

Not deployed. `fly.toml` is written but never applied; read its header first, the app
has to be created onto its own isolated private network by hand before any deploy.
