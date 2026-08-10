"""SIGTERM arms a hard exit fuse (ENG-223): the quit path can wedge mid-shutdown (measured live: a
quit racing a pending update left uvicorn hung 8+ minutes with its whole agent-CLI tree orphaned at
~700MB), so if graceful shutdown has not finished FUSE_S after TERM, the fuse kills our process
tree and exits. A daemon thread, so a wedged event loop cannot block it."""

import os
import subprocess
import threading
from typing import List

from typeguard import typechecked

FUSE_S = 10.0


@typechecked
def p_descendant_pids() -> List[int]:
    pids: List[int] = []
    frontier: List[int] = [os.getpid()]
    for depth in range(6):
        next_frontier: List[int] = []
        for parent in frontier:
            try:
                out = subprocess.run(
                    ["pgrep", "-P", str(parent)], capture_output=True, text=True, timeout=2,
                ).stdout
            except Exception:
                continue
            for tok in out.split():
                try:
                    next_frontier.append(int(tok))
                except ValueError:
                    pass
        pids.extend(next_frontier)
        if not next_frontier:
            break
        frontier = next_frontier
    return pids


@typechecked
def p_burn() -> None:
    for pid in p_descendant_pids():
        try:
            os.kill(pid, 9)
        except Exception:
            pass
    os._exit(0)


@typechecked
def arm_shutdown_fuse() -> None:
    """Called at lifespan-shutdown START (already past TERM), so no signal handling: just the timer. Touching signal.signal here would clobber uvicorn's asyncio-installed handlers."""
    if os.name == "nt":
        return
    timer = threading.Timer(FUSE_S, p_burn)
    timer.daemon = True
    timer.start()
