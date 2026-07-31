"""Reading a finished session correctly, including the failures the backend calls success."""

from runner.workflow_run import final_answer, render_transcript, system_notices

# Shape taken verbatim from a real container run whose provider token was rejected.
REJECTED_TOKEN_SESSION = [
    {"role": "user", "content": "Reply with exactly the word PONG and nothing else."},
    {"role": "system", "content": "Provider authentication expired. Open Settings, Models and reconnect, then send your message again."},
]

ANSWERED_SESSION = [
    {"role": "user", "content": "ping"},
    {"role": "assistant", "content": [{"type": "tool_use", "name": "Bash", "input": {"command": "echo hi"}}]},
    {"role": "assistant", "content": [{"type": "text", "text": "PONG"}]},
    {"role": "assistant", "content": [{"type": "text", "text": "draft"}], "hidden": True},
]


def test_a_rejected_credential_surfaces_as_a_system_notice() -> None:
    assert system_notices(REJECTED_TOKEN_SESSION) == [REJECTED_TOKEN_SESSION[1]["content"]]
    assert final_answer(REJECTED_TOKEN_SESSION) == ""


def test_a_healthy_run_raises_no_notices() -> None:
    assert system_notices(ANSWERED_SESSION) == []


def test_the_answer_is_the_last_visible_assistant_text() -> None:
    assert final_answer(ANSWERED_SESSION) == "PONG"


def test_the_transcript_keeps_tool_calls_and_drops_hidden_turns() -> None:
    transcript = render_transcript(ANSWERED_SESSION)
    assert "[tool Bash]" in transcript
    assert "PONG" in transcript
    assert "draft" not in transcript
