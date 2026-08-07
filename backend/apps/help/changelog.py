"""The release story, in one place, for three surfaces: the in-app What's New card, the GitHub
release body, and the Help agent's context. One source means the agent can never answer from a
stale picture of the app, and a release can never ship with no story."""

from typing import Dict, List

from pydantic import BaseModel, ConfigDict
from typeguard import typechecked


class ReleaseNote(BaseModel):
    model_config = ConfigDict(validate_assignment=True)
    version: str
    headline: str
    # User-facing lines only: what changed for the person using the app, not the diff.
    highlights: List[str]
    fixes: List[str]


P_RELEASES: List[ReleaseNote] = [
    ReleaseNote(
        version="1.7.5",
        headline="Fewer dead ends, and the app tells us when something breaks.",
        highlights=[
            "Scrolling inside any panel, chat, or browser stays in that panel instead of dragging the canvas.",
            "Clicking the Marketplace window frames it like every other window, and camera moves land softly instead of snapping.",
            "While a browser agent works you see the live mini browser only, not the same action log twice.",
        ],
        fixes=[
            "Dictation lands in the field you started in, even if you click elsewhere while it is still transcribing.",
            "The first message after opening a chat reuses the warmed-up connection, so it answers sooner.",
            "A provider hiccup that fixes itself no longer shows a scary reconnect card.",
            "Crashes, freezes, and runaway memory now report themselves, so bugs get diagnosed instead of guessed at.",
        ],
    ),
    ReleaseNote(
        version="1.7.4",
        headline="Chats survive a hiccup instead of stopping.",
        highlights=[
            "A dropped local connection retries and resumes the same answer instead of failing the message.",
            "The spawn composer steps aside when a window is open.",
        ],
        fixes=[
            "App previews reconnect on their own after a backend restart.",
            "Dictation cue sounds default to a level you can actually hear.",
        ],
    ),
]


@typechecked
def release_notes(version: str) -> ReleaseNote | None:
    for note in P_RELEASES:
        if note.version == version:
            return note
    return None


@typechecked
def latest_release() -> ReleaseNote:
    return P_RELEASES[0]


@typechecked
def as_markdown(note: ReleaseNote) -> str:
    """The GitHub release body; identical words to the in-app card, so nobody reads two stories."""
    lines = [f"## {note.version}: {note.headline}", ""]
    if note.highlights:
        lines.append("### New")
        lines += [f"- {h}" for h in note.highlights]
        lines.append("")
    if note.fixes:
        lines.append("### Fixed")
        lines += [f"- {f}" for f in note.fixes]
    return "\n".join(lines).strip()


@typechecked
def help_context_block(app_version: str) -> str:
    """What the Help agent must know about what just changed, so "what's new" is never stale."""
    note = release_notes(app_version) or latest_release()
    body = [f"Version {note.version}: {note.headline}"]
    body += [f"- new: {h}" for h in note.highlights]
    body += [f"- fixed: {f}" for f in note.fixes]
    return "\n".join(body)


@typechecked
def all_versions() -> Dict[str, str]:
    return {n.version: n.headline for n in P_RELEASES}
