"""Kill app-runtime processes left behind by a previous OpenSwarm that died badly.

`stop_all()` reaps runtimes on a CLEAN shutdown. A crash, a SIGKILL, or a force-quit skips it, and
every `bash run.sh` plus its vite/uvicorn descendants reparents to PID 1 and keeps running: measured
on a dev machine, ghosts had been alive for **2 days 19 hours**, still holding their ports. The only
existing handling reallocates around a ghost that squats a port, so the ghost never dies at all and
they accumulate across sessions.

This runs at startup, before any runtime is spawned, which is the one moment when a workspace process
cannot legitimately belong to us: we have not started any yet.
"""

import logging
import os
import subprocess
from typing import List

from typeguard import typechecked

from backend.apps.outputs.runtime_proc import kill_descendant_tree
from backend.config.paths import OUTPUTS_WORKSPACE_DIR as WORKSPACE_DIR

logger = logging.getLogger(__name__)


@typechecked
def p_live_backend_pids() -> set:
    """PIDs of every running backend. A workspace process descended from one of these is ALIVE and
    owned, not a ghost; a first draft of this reaper matched on the workspace path alone and would
    have killed 14 working app runtimes on a machine where the owning backend was up."""
    try:
        out = subprocess.run(["ps", "-eo", "pid=,args="], capture_output=True, text=True, timeout=8)
    except Exception:
        return set()
    pids = set()
    for line in (out.stdout or "").splitlines():
        if "uvicorn" not in line or "backend.main" not in line:
            continue
        head = line.strip().split(None, 1)
        if head and head[0].isdigit():
            pids.add(int(head[0]))
    return pids


@typechecked
def p_ppid_map() -> dict:
    try:
        out = subprocess.run(["ps", "-eo", "pid=,ppid="], capture_output=True, text=True, timeout=8)
    except Exception:
        return {}
    m = {}
    for line in (out.stdout or "").splitlines():
        parts = line.split()
        if len(parts) == 2 and parts[0].isdigit() and parts[1].isdigit():
            m[int(parts[0])] = int(parts[1])
    return m


@typechecked
def find_ghost_runtime_pids() -> List[int]:
    """PIDs of workspace processes that NO live backend owns.

    Matched on the absolute workspace path, so an unrelated `npm run dev` elsewhere is never touched,
    then filtered by walking each candidate's ancestry: if a live backend is anywhere above it, it is
    someone's working app and is left alone.
    """
    # Case-FOLDED needle. macOS's default filesystem is case-insensitive, so a process may report
    # `.../openswarm/...` while our resolved path is `.../OpenSwarm/...`: the same folder, but a
    # case-sensitive `in` check misses it and the ghost survives (found live on a packaged smoke).
    needle = os.path.abspath(WORKSPACE_DIR).casefold()
    try:
        out = subprocess.run(["ps", "-eo", "pid=,args="], capture_output=True, text=True, timeout=8)
    except Exception:
        return []
    mine = os.getpid()
    owners = p_live_backend_pids()
    parents = p_ppid_map()
    # WE are a backend, so a scan that finds no live backend has failed, not found ghosts: an empty
    # owner set turns every working app into a "ghost" and the sweep would kill them all mid-use.
    # Boot relied on running before anything spawned; the 10-minute sweep gets no such alibi.
    if not owners or not parents:
        return []
    ghosts: List[int] = []
    for line in (out.stdout or "").splitlines():
        line = line.strip()
        if needle not in line.casefold():
            continue
        head = line.split(None, 1)
        if not head or not head[0].isdigit():
            continue
        pid = int(head[0])
        if pid == mine:
            continue
        cur, owned, broken = pid, False, False
        for _ in range(24):
            if cur in owners or cur == mine:
                owned = True
                break
            if cur <= 1:
                break
            nxt = parents.get(cur)
            if nxt is None:
                # The pid list and the ppid map are two separate ps snapshots; a process spawned
                # between them has no entry here. Indeterminate is NOT ghost: skip, never kill.
                broken = True
                break
            cur = nxt
        if not owned and not broken:
            ghosts.append(pid)
    return ghosts


@typechecked
def reap_ghost_runtimes() -> int:
    """Reap them, leaves-first. Returns how many top-level processes were signalled.

    Fire-and-forget by design: a machine where `ps` is restricted or a PID that vanishes between the
    scan and the kill must never stop the backend from booting.
    """
    pids = find_ghost_runtime_pids()
    if not pids:
        return 0
    logger.warning(
        "reaping %d ghost app-runtime process(es) left by a previous session: %s",
        len(pids), pids[:12],
    )
    killed = 0
    for pid in pids:
        try:
            kill_descendant_tree(pid, "TERM")
            os.kill(pid, 15)
            killed += 1
        except (ProcessLookupError, PermissionError, OSError):
            continue
    return killed
