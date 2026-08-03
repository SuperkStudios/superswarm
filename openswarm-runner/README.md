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

## Files the run makes

`/data/workspace` is the agent's working directory and **the only path whose contents survive**.
It is seeded as `default_folder` before the backend boots, and the agent is told in its system
prompt that files saved there come back and everything else is destroyed.

After the workflow reaches a terminal state (including a timeout, so partial work still lands) the
runner walks that directory and POSTs each file to `callback.artifacts_url`, then sends the
terminal report. That order is load-bearing: the per-run callback token is refused once the run is
closed, so uploading afterwards would be rejected.

Caps, applied in the runner AND again at the control plane, which is the one that counts:

| Limit | Value |
| --- | --- |
| One file | 20 MB |
| One run, all files | 50 MB |
| Files per run | 40 |

Nothing is ever truncated. A file past a cap is not sent and instead arrives as a row in the
report's `files[]` carrying a written reason, so the user reads "your 512 MB render could not be
sent" rather than finding a 20 MB fragment. `.git`, `node_modules`, `__pycache__`, `.venv`,
`.claude` and the usual caches are skipped, and symlinks are never followed.

## Skills and connected apps

`skills[]` in the run spec is written to `~/.claude/skills/<id>/` before boot. This is not a
nicety: the backend registers the Skill tool only when at least one non-built-in skill exists on
disk, so a container without them has no Skill tool at all and answers from general knowledge in
the same confident voice it would use with the real thing.

`unavailable_mcp_servers[]` is **names only**. The user's MCP credentials (Slack session cookies,
Notion and GitHub access tokens, Google refresh tokens) never leave their machine, so the names go
up purely so the run's system prompt can tell the agent which apps exist and are out of reach.
`McpServerNote` forbids extra fields, so there is no shape a secret could travel in.

## What the image carries for the App Builder

`node`, `npm` and `npx`, plus the App Builder template's `node_modules` pre-installed at the digest
path `bundled_extracted_modules()` probes. Without npm, `CreateApp` scaffolded an app that could
never install, build or serve; without the baked cache, the first `CreateApp` in a run would pay a
cold registry install. `git` also carries a system identity (`/etc/gitconfig`), so a workflow that
commits does not die on "Author identity unknown".

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

## Parity with a local run, and the one gap we accept

A cloud run boots the same Electron shell, the same backend and the same browser code path as a
laptop does, so browser steps behave the same in both places. One row of the parity matrix does not
pass and is not going to, so it is refused at create time rather than failed at 3am:

**A workflow that needs an account you are already signed into.** Every run gets a fresh browser
profile in a throwaway container. There is no keychain, no cookie jar, and nobody there to type a
password or clear a 2FA prompt. Copying a logged-in session up would mean shipping the user's live
cookies to a machine we destroy minutes later, which is a worse trade than refusing.

This is declared, not implied: `signed_in_browser` is deliberately absent from
`RUNNER_CAPABILITIES` in `openswarm-cloud/src/workflows/runnerCapabilities.ts`, and
`checkRunnerCapabilities` turns it into a refusal that names the workaround ("run it on your own
machine"). `tests/runner-capabilities.test.ts` asserts the flag stays off, so nobody can quietly
flip it without reading this.

Everything else in that matrix is a capability flag that can flip when the container learns the
trick. `browser` already did: it was refused until Electron under Xvfb landed, and flipping the one
flag unblocked every browser workflow with no other edit.

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
