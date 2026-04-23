# WebSocket API

Single namespace `/ws` on the control plane. socket.io protocol. JWT authentication at handshake via `auth.token`.

## Handshake

```js
const socket = io('wss://kairos.vectorhost.net/ws', {
  auth: { token: accessToken },
});
```

Server verifies JWT, joins the client to per-user and per-session rooms. Invalid token → `connect_error` with `{code: "AUTH_REQUIRED"}`.

## Room Model

- `user:{user_id}` — all tabs/devices for a user
- `session:{session_id}` — all participants of a session

Clients auto-join `user:{user_id}`. Joining a session room: emit `session.join { session_id }`.

## Presence Heartbeat

Client emits `presence.ping` every 30s while the tab/app is active. Server tracks `last_ping_at` on the session. Absence >60s during an active run → server triggers channel reroute for pending approvals.

---

## Client → Server Events

| Event | Payload | Purpose |
|---|---|---|
| `session.join` | `{session_id}` | Join session room |
| `session.leave` | `{session_id}` | Leave session room |
| `user.message` | `{session_id, content, request_id}` | Send a user message → creates a run |
| `user.cancel` | `{run_id}` | Cancel in-flight run |
| `user.approval_response` | `{approval_id, decision: "approved"\|"denied", note?}` | Chat-channel approval resolution |
| `presence.ping` | `{session_id}` | Presence heartbeat |
| `self_state.subscribe` | `{workspace_id}` | Receive self-state change events |

## Server → Client Events

### Session & Runs

| Event | Payload |
|---|---|
| `session.connected` | `{session_id, user_id, mode, active_agent, active_persona}` |
| `run.started` | `{run_id, session_id, model_id, agent_role}` |
| `run.token` | `{run_id, content_delta}` — token streaming |
| `run.tool_event` | `{run_id, tool_execution_id, event_type, status, params?, result?}` |
| `run.delegated` | `{parent_run_id, child_run_id, agent_role}` |
| `run.completed` | `{run_id, tokens_in, tokens_out, cost_usd}` |
| `run.cancelled` | `{run_id, reason}` |
| `run.failed` | `{run_id, error}` |
| `agent.response` | `{session_id, message_id, content}` — final Ego-voiced message |

### Approvals

| Event | Payload |
|---|---|
| `approval.requested` | `{approval_id, description, blast_radius, params_preview, expires_at, tool_id?}` |
| `approval.resolved` | `{approval_id, decision, resolved_via, resolved_at}` |

### Initiative & Self-Modification

| Event | Payload |
|---|---|
| `initiative.surfaced` | `{item_id, content, score, action?, dismissable}` |
| `mode.changed` | `{session_id, mode, reason}` |
| `persona.switched` | `{session_id, persona_id, voice}` |
| `workspace.switched` | `{session_id, workspace_id, briefing}` |
| `agent.switched` | `{session_id, agent_id}` |
| `briefing.delivered` | `{session_id, summary, proactive_items, tool_health, open_questions}` |
| `self_state.updated` | `{workspace_id, version, triggered_by}` |

### Connection / Errors

| Event | Payload |
|---|---|
| `error` | `{code, message, request_id}` |
| `reconnect` | — (standard socket.io) |

---

## Message-to-Run Flow

```
Client                    Server (control-plane)           Cognition
  │                              │                              │
  │─ user.message ──────────────▶│                              │
  │                              │── persist message            │
  │                              │── create run (QUEUED)        │
  │◀── run.started ──────────────│── dispatch via Redis ───────▶│
  │                              │                              │── Ego lightweight pass
  │                              │                              │── classify + dispatch task
  │                              │◀─ trace events ──────────────│
  │◀── run.token (stream) ───────│◀─ stream tokens ─────────────│
  │                              │                              │── tool call?
  │                              │── policy evaluate ────────── (if approval needed)
  │◀── approval.requested ───────│                              │
  │─ user.approval_response ────▶│── resolve                    │
  │                              │── unblock via Redis ────────▶│── execute tool
  │◀── run.tool_event ───────────│◀─ tool status ───────────────│
  │                              │                              │── Ego re-voices
  │◀── agent.response ───────────│◀─ final message ─────────────│
  │◀── run.completed ────────────│                              │
```

## Trace ID Propagation

Every server-emitted event carries a `request_id` (for user-initiated flows) or `trace_id` (always). Client persists these for support/debugging.

## Error Semantics

- Auth failure at handshake → `connect_error`
- Per-event errors → `error` event with same `request_id`
- Server never drops the connection for business errors

## Rate Limits

- 10 `user.message` per minute per session (soft: backpressure, queued at client)
- 100 `presence.ping` per minute (hard cap; excess ignored)
