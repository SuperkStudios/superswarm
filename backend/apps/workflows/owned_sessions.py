"""Which agent sessions a workflow OWNS, and therefore takes with it when it is purged.

Purging a workflow used to remove the record and its run history and leave the chat transcripts
behind forever. That is a storage leak and, worse, a broken promise: the user asked for an
irreversible delete and the conversation stayed on disk. It went unnoticed because a separate bug
was unlinking open sessions on every boot, which garbage-collected the orphans by accident. Fixing
that bug is what exposed this one.

The owned/referenced split is the load-bearing part. A workflow's edit, scheduling and test chats
exist only to serve it and die with it. `source_session_id` is the user's own chat that the
workflow was generated FROM; it has its own life and must survive. Deleting it would take a real
conversation the user never asked to lose.
"""

from typing import List

from typeguard import typechecked

from backend.apps.workflows.models import Workflow

# Sticky session pointers whose sessions belong to the workflow. Adding a fourth without listing it
# here leaks a transcript past a hard delete, so a test pins this against the model's own fields.
OWNED_SESSION_FIELDS = (
    "edit_agent_session_id",
    "schedule_agent_session_id",
    "last_test_session_id",
)

# Pointers to sessions the workflow did NOT create. Never delete these.
REFERENCED_SESSION_FIELDS = ("source_session_id",)


@typechecked
def owned_session_ids(wf: Workflow) -> List[str]:
    """Every session id this workflow is responsible for cleaning up."""
    out: List[str] = []
    for field in OWNED_SESSION_FIELDS:
        sid = getattr(wf, field, None)
        if isinstance(sid, str) and sid and sid not in out:
            out.append(sid)
    return out


@typechecked
async def purge_owned_sessions(wf: Workflow) -> int:
    """Close and delete the workflow's own chats. Returns how many were removed.

    Best-effort per session: one unreadable file must not strand the rest, because a partial purge
    is the state that leaves a transcript behind.
    """
    import logging
    from backend.apps.agents.manager.session.session_store import delete_session_file

    logger = logging.getLogger(__name__)
    removed = 0
    for sid in owned_session_ids(wf):
        try:
            from backend.apps.agents.agent_manager import agent_manager
            await agent_manager.close_session(sid)
        except Exception:
            logger.debug("could not close session %s during purge", sid, exc_info=True)
        try:
            delete_session_file(sid)
            removed += 1
        except Exception:
            logger.warning("could not delete session file %s during purge", sid, exc_info=True)
    return removed
