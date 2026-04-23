# HTTP API

All endpoints under `/api/v1`. Authentication via `Authorization: Bearer <access_token>` unless noted. Internal service-to-service endpoints require `X-Internal-Service` header + HMAC signature.

## Conventions

### Error Envelope

```json
{
  "code": "STRING",
  "message": "Human-readable",
  "details": {},
  "request_id": "UUID"
}
```

### Pagination

Cursor-based. Query params: `cursor`, `limit` (default 20, max 100).
Response envelope: `{ data: [...], next_cursor: STRING|null, has_more: BOOLEAN }`.

### Codes

`AUTH_REQUIRED` (401) · `FORBIDDEN` (403) · `NOT_FOUND` (404) · `VALIDATION_FAILED` (400) · `RATE_LIMITED` (429) · `CONFLICT` (409) · `INTERNAL_ERROR` (500) · `GONE` (410 — used by approval webhooks).

---

## Auth

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/auth/login` | `{email, password}` | `{access_token, refresh_token, user}` |
| POST | `/auth/refresh` | `{refresh_token}` | `{access_token}` |
| POST | `/auth/logout` | `{refresh_token}` | `204` |
| GET  | `/auth/me` | — | `{user}` |

Login rate limit: 5 attempts / 15 min / IP.

---

## Workspaces

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/workspaces` | `{name, description?, settings?}` | `Workspace` |
| GET  | `/workspaces` | — | `Workspace[]` |
| GET  | `/workspaces/:id` | — | `Workspace` |
| PATCH| `/workspaces/:id` | partial | `Workspace` |
| DELETE| `/workspaces/:id` | — | `204` (soft-delete, 30d retention) |
| GET  | `/workspaces/:id/provider-status` | — | `{ openai: bool, anthropic: bool, openrouter: bool }` |

Settings JSONB:
```
{
  allow_pii: boolean,
  default_model: string,
  role_models?: { executor, planner, researcher, coder, reviewer, browser_operator, safety_checker: string },
  run_budget_tokens: integer,
  run_budget_time_ms: integer,
  retention_policy: { memory_days, audit_days }
}
```

---

## Sessions

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/workspaces/:id/sessions` | `{ agent_id?, persona_id? }` | `Session` |
| GET  | `/workspaces/:id/sessions` | `?status=&cursor=` | paginated |
| GET  | `/sessions/:id?include_messages=bool` | — | `Session` + messages |
| PATCH| `/sessions/:id` | `{agent_id?, persona_id?, mode?}` | `Session` |
| POST | `/sessions/:id/end` | — | `Session` |
| DELETE | `/sessions/:id` | — | `204` (hard-delete, FK cascade) |
| DELETE | `/workspaces/:id/sessions` | — | `204` (clear all, OPERATOR role) |
| GET  | `/sessions/:id/trace` | — | full trace bundle |

---

## Runs (read-only; runs dispatched via WS)

| Method | Path | Body | Returns |
|---|---|---|---|
| GET  | `/runs/:id/traces` | — | `RunTrace[]` |
| GET  | `/runs/:id/children` | — | delegation tree |

> There is no `POST /runs`. Runs are created implicitly by sending a user message over WebSocket.

---

## Tools

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/tools` | manifest | `Tool` |
| GET  | `/tools` | `?tier=` | `Tool[]` |
| GET  | `/tools/:id` | — | `Tool` |
| PATCH| `/tools/:id` | partial | `Tool` |
| POST | `/tools/:id/execute` | `{params, run_id, capability_token}` | `{execution_id}` |

Tool execution is normally invoked by cognition via internal RPC, not by clients. Direct execution is for smoke tests and admin only.

---

## Memory

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/memory` | `{workspace_id, scope, content, sensitivity?, metadata?}` | `MemoryEntry` (state: auto\|pending) |
| GET  | `/memory` | `?workspace_id=&scope=&cursor=` | paginated |
| GET  | `/memory/:id` | — | `MemoryEntry` |
| DELETE | `/memory/:id` | — | `204` |
| POST | `/memory/:id/approve` | — | `MemoryEntry` |
| POST | `/memory/:id/reject` | — | `MemoryEntry` |
| POST | `/memory/recall` | `{workspace_id, query, limit?}` | `MemoryEntry[]` |

---

## Approvals

| Method | Path | Body | Returns |
|---|---|---|---|
| GET  | `/approvals` | `?state=&session_id=&cursor=` | paginated |
| GET  | `/approvals/:id` | — | `Approval` |
| POST | `/approvals/:id/resolve` | `{decision, note?}` | `Approval` |
| GET  | `/approvals/webhook/:token` | (public, token-auth) | `200` OK \| `410 Gone` |

`POST /approvals/:id/resolve` is the chat-channel path. `/webhook/:token` is the email-channel path. Both transition the state machine; second attempt on either returns 410.

---

## Goals

| Method | Path | Body | Returns |
|---|---|---|---|
| POST | `/goals` | `{workspace_id?, description, priority, trigger?}` | `Goal` |
| GET  | `/goals` | `?workspace_id=&status=` | `Goal[]` |
| PATCH| `/goals/:id` | partial | `Goal` |
| DELETE| `/goals/:id` | — | `204` |

---

## Agents, Personas, Themes, Skills, Workspaces (Layer 2)

Mirror pattern for each. Key endpoints:

| Method | Path | Returns |
|---|---|---|
| POST `/agents` | create | `Agent` |
| GET `/agents` | list | `Agent[]` |
| POST `/agents/:id/switch` | session-scoped activation | `Agent` |
| POST `/agents/:id/rollback` | restore previous version | `Agent` |

(Same pattern for `/personas`, `/themes`, `/skills`, `/workspaces` where applicable.)

---

## Self-State (read-only, admin-scoped)

| Method | Path | Returns |
|---|---|---|
| GET  | `/self-state/current?workspace_id=` | current Markdown + JSON shadow |
| GET  | `/self-state/versions?workspace_id=&limit=` | version list |
| GET  | `/self-state/versions/:version` | specific snapshot |

Writes are internal-only (cognition → control plane via RPC).

---

## Audit

| Method | Path | Returns |
|---|---|---|
| GET  | `/audit/events` | paginated, filtered |

Query params: `workspace_id`, `category`, `event_type`, `from`, `to`, `cursor`, `limit`.

---

## Observability

| Method | Path | Returns |
|---|---|---|
| GET  | `/traces/:id` | full trace with spans |
| GET  | `/costs/summary` | `?workspace_id=&group_by=day\|session\|stratum&from=&to=` |

---

## Health

| Method | Path | Returns |
|---|---|---|
| GET  | `/health` | `{status:"ok"}` (no auth) |
| GET  | `/health/ready` | `{postgres, redis, minio, vault}` each `ok\|fail` |

---

## Internal Service Endpoints (cognition → control plane)

`X-Internal-Service: cognition` + `X-Internal-Signature: HMAC` required. No JWT.

| Method | Path | Purpose |
|---|---|---|
| POST | `/internal/policy/evaluate` | classify + authorize tool call → capability token |
| POST | `/internal/approvals/request` | create approval record |
| POST | `/internal/self-state/write` | write new snapshot (triggers audit) |
| POST | `/internal/audit/record` | direct audit write |
| POST | `/internal/runs/trace` | append run trace event |
| POST | `/internal/vault/resolve` | policy-engine-only alias resolution |
| POST | `/internal/messages/persist` | persist message to session |

---

## RBAC Matrix

| Role | Workspaces | Sessions | Runs (read) | Tools (admin) | Memory | Approvals | Self-State | Audit |
|---|---|---|---|---|---|---|---|---|
| OWNER | CRUD | CRUD | R | CRUD | CRUD | Resolve | R | R |
| ADMIN | CRUD | CRUD | R | CRUD | CRUD | Resolve | R | R |
| OPERATOR | R, CU (own) | CRUD (own) | R | — | CR (own) | Resolve (own) | — | R (own) |
| VIEWER | R | R | R | — | R | — | — | — |
