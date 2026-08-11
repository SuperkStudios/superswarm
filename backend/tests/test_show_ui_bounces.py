"""Validation bounces from the ShowUI/AskUI server must be normal content, never isError:
the CLI skips the PostToolUse hook for errored calls, so an isError bounce leaves no
tool_result and the frontend renders the dead ask as a live clickable card forever (ENG-232)."""

from typeguard import typechecked

from backend.apps.agents.show_ui_mcp_server import handle_tool_call


@typechecked
def test_askui_props_string_bounce_is_not_error() -> None:
    out = handle_tool_call("AskUI", {"component": "option-list", "props": "not an object"})
    assert "isError" not in out
    assert "props must be an object" in out["content"][0]["text"]


@typechecked
def test_askui_missing_id_bounce_is_not_error() -> None:
    out = handle_tool_call("AskUI", {"component": "option-list", "props": {"options": []}})
    assert "isError" not in out
    assert "props.id" in out["content"][0]["text"]


@typechecked
def test_askui_display_component_bounce_is_not_error() -> None:
    out = handle_tool_call("AskUI", {"component": "image", "props": {"id": "x"}})
    assert "isError" not in out
    assert "AskUI only supports" in out["content"][0]["text"]


@typechecked
def test_showui_interactive_refusal_is_not_error() -> None:
    out = handle_tool_call("ShowUI", {"component": "option-list", "props": {"id": "x", "options": []}})
    assert "isError" not in out
    assert "display-only" in out["content"][0]["text"]


@typechecked
def test_unknown_tool_stays_a_real_error() -> None:
    out = handle_tool_call("NoSuchTool", {})
    assert out.get("isError") is True
