"""TestWorkflow must return the RESULT, not a promise. The old handler returned as soon as the Test
Agent spawned, so the model ended its turn and a human had to re-ping it to continue: the exact
"it just stops" annoyance."""

import inspect

from backend.apps.agents import schedule_mcp_server as srv


def test_the_handler_waits_for_the_result_instead_of_returning_a_promise():
    src = inspect.getsource(srv.handle_test_workflow)
    assert "while time.time() < deadline" in src, "the tool must block until the test settles"
    assert "test-transcript" in src, "and read the transcript itself, not delegate that to the model"
    assert "Test finished" in src


def test_a_long_test_returns_honestly_instead_of_hanging_the_turn():
    src = inspect.getsource(srv.handle_test_workflow)
    assert "still running after" in src
    assert srv.P_TEST_WAIT_S <= 300, "a bounded wait; a wedged test must never hold a turn forever"
    assert srv.P_TEST_POLL_S >= 1


def test_the_description_tells_the_model_to_keep_going():
    desc = next(t["description"] for t in srv.TOOLS if t["name"] == "TestWorkflow")
    assert "WAIT for the result" in desc and "same turn" in desc
    assert "without stopping to ask the user" in desc
