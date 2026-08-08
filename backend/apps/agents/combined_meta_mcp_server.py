#!/usr/bin/env python3
"""One stdio MCP process hosting the always-on, ungated meta tools that used to be three separate
python interpreters per agent CLI (MCPList/Search/Activate, SettingsRead/Write, CreateApp).

Why merge only these three: their tool NAMES are globally unique, none of them is referenced by
the non-bypassable permission gate (grep for `mcp__openswarm-mcp-meta__` etc. finds nothing in
build_effective_tool_lists / path_gate), and all three are registered unconditionally with the
same env. So collapsing them into one process is pure fan-out reduction with zero behavior change:
5 parked CLIs drop 15 idle interpreters to 5 (ENG-208). The gate-coupled servers (schedule, web,
browser-agent) and the conditional ones (skill, show-ui, spawn, invoke) stay separate on purpose.

We reuse each sub-server's own TOOLS + handle_tool_call; we own the stdio loop so their main() and
send_response never run. Sibling import (not backend.*) matches how these scripts are launched by
path in both dev and the packaged bundle."""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import apps_mcp_server as p_apps  # noqa: E402
import mcp_meta_server as p_meta  # noqa: E402
import settings_meta_server as p_settings  # noqa: E402

P_SUBSERVERS = [p_meta, p_settings, p_apps]

TOOLS = []
P_ROUTE = {}
for p_mod in P_SUBSERVERS:
    for p_tool in p_mod.TOOLS:
        TOOLS.append(p_tool)
        P_ROUTE[p_tool["name"]] = p_mod


def send_response(id_, result=None, error=None):
    msg = {"jsonrpc": "2.0", "id": id_}
    if error is not None:
        msg["error"] = error
    else:
        msg["result"] = result
    sys.stdout.write(json.dumps(msg) + "\n")
    sys.stdout.flush()


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue
        method = msg.get("method")
        id_ = msg.get("id")
        params = msg.get("params", {})
        if method == "initialize":
            send_response(id_, {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "serverInfo": {"name": "openswarm-core", "version": "1.0.0"},
            })
        elif method == "notifications/initialized":
            pass
        elif method == "tools/list":
            send_response(id_, {"tools": TOOLS})
        elif method == "tools/call":
            tool_name = params.get("name", "")
            arguments = params.get("arguments", {})
            mod = P_ROUTE.get(tool_name)
            if mod is None:
                send_response(id_, {"content": [{"type": "text", "text": f"Unknown tool: {tool_name}"}], "isError": True})
                continue
            try:
                send_response(id_, mod.handle_tool_call(tool_name, arguments))
            except Exception as e:
                send_response(id_, error={"code": -32000, "message": str(e)})
        elif method in ("resources/list",):
            send_response(id_, {"resources": []})
        elif method in ("prompts/list",):
            send_response(id_, {"prompts": []})
        elif method == "ping":
            send_response(id_, {})
        elif id_ is not None:
            send_response(id_, error={"code": -32601, "message": f"Method not found: {method}"})


if __name__ == "__main__":
    main()
