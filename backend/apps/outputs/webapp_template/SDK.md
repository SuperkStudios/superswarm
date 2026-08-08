# OpenSwarm App SDK — call the host from your app

Your app runs INSIDE OpenSwarm, and the host lends it real capabilities: the user's
LLM subscription, their saved workflows, and live agents on the canvas. Two pre-wired
helper modules expose all of it; never hand-roll fetch calls to the host.

| Where | Import |
| --- | --- |
| Frontend (React/TS) | `import { llm, listWorkflows, runWorkflow, listWorkflowRuns, spawnAgent, agentSession } from '@/openswarmHost';` |
| Backend (FastAPI) | `from backend.apps.openswarm_host.openswarm_host import llm, list_workflows, run_workflow, list_workflow_runs, spawn_agent, agent_session` |

Auth is automatic: the frontend reads the `?token=` the host injects into the preview URL;
the backend reads the rotating token file the host passes via `OPENSWARM_HOST_TOKEN_FILE`.
You never handle credentials.

## LLM calls (the user's own subscription, any provider)

```ts
const answer = await llm('Summarize this in one line: ' + text);
const haiku = await llm('Write a haiku about rain', { model: 'haiku', system: 'You are terse.' });
```

```python
answer = llm("Summarize this in one line: " + text)
```

- Omit `model` for the cheapest tier of whatever provider the user runs (never assume Anthropic).
- One-shot only; keep prompts small, this is the user's real money.

## Workflows

```ts
const flows = await listWorkflows();          // [{id, name, enabled, ...}]
await runWorkflow(flows[0].id);               // fire it now
const runs = await listWorkflowRuns();        // read status/results
```

A workflow the user switched OFF will refuse to run; surface the host's error to the user
instead of retrying.

## Agents on the canvas

```ts
const sessionId = await spawnAgent('Research the top 3 CRM tools and report back', {
  name: 'CRM scout',
  x: 400, y: 300,          // optional canvas position for the card
});
const state = await agentSession(sessionId);  // {status, messages, ...} — poll while status === 'running'
```

The agent is a real OpenSwarm agent card the user can watch and take over. Spawn sparingly:
one agent per user action, never in a loop.

## Tool UI components — ready-made rich widgets

The full OpenSwarm tool-ui component set is vendored at `src/toolui/` (import via the
`@toolui` alias). These are the same widgets agents render for rich results: use them
instead of hand-building tables, charts, code viewers, or media blocks.

Available components (each lives at `@toolui/components/<name>`): approval-card, audio,
chart, citation, code-block, code-diff, data-table, geo-map, image, image-gallery,
instagram-post, item-carousel, link-preview, linkedin-post, message-draft, option-list,
order-summary, parameter-slider, plan, preferences-panel, progress-tracker, question-flow,
stats-display, terminal, video, weather-widget, x-post.

Render through `VendoredToolUi` (it validates props against the component's zod schema,
loads the styles, and applies the required `.tool-ui-scope` wrapper + dark mode for you):

```tsx
import VendoredToolUi from '@toolui/VendoredToolUi';

<VendoredToolUi name="data-table" props={{ columns, rows, title: 'Leads' }} />
```

Direct imports (`import { DataTable } from '@toolui/components/data-table'`) work too, but
then YOU must import `@toolui/toolui.css` once and wrap the render in
`<div className="tool-ui-scope">` (add `dark` in dark mode) or the widget renders unstyled.

Each component folder carries its own README + zod schema (`@toolui/registry` maps
name -> schema). They style themselves (scoped Tailwind, no preflight), so they drop
into the MUI app without fights, and they follow the app's light/dark mode.

## What the SDK does NOT give you (yet)

- Direct calls to the user's connected tools/MCP connectors (Gmail, Slack, ...). That surface
  needs per-app permission grants and is not wired; do not fake it by calling other host routes.
  If your app needs a tool action today, spawn an agent and ask it to do the task.

## Ground rules

- Degrade gracefully: every helper throws on a host error; catch and show a clean message,
  never a blank screen.
- These helpers only work while the app runs inside OpenSwarm (preview or installed). A
  published web app on openswarm.host has no host; guard with a try/catch and hide the feature.
