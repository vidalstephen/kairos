# API Design Standards

Applies to HTTP and WebSocket APIs exposed by `control-plane` and internal RPC interfaces.

---

## Versioning

- HTTP: version in URL (`/api/v1/...`)
- WebSocket: version in event namespace if we ever break schema; for now, additive only
- Breaking changes = new version. Never mutate v1 semantics.

## Resource Naming

- Plural nouns: `/sessions`, `/approvals`, `/runs`
- Sub-resources: `/sessions/:id/trace`
- Actions as verbs: `/sessions/:id/end`, `/agents/:id/switch`
- Internal endpoints prefixed: `/internal/...`

Nouns preferred over verbs at the top level. Action sub-paths are fine when the verb is the action taken.

## HTTP Methods

| Method | Semantic |
|---|---|
| GET | Read, safe, idempotent |
| POST | Create OR non-idempotent action (clearly labeled) |
| PATCH | Partial update |
| PUT | Full replace (rare; prefer PATCH) |
| DELETE | Remove (may be soft) |

## Status Codes

- 200 OK — success with body
- 201 Created — resource created; include `Location` header
- 204 No Content — success with no body
- 400 Bad Request — validation failure
- 401 Unauthorized — no/invalid credentials
- 403 Forbidden — authenticated but not permitted
- 404 Not Found
- 409 Conflict — state conflict (e.g., budget exceeded)
- 410 Gone — used for already-resolved approval webhooks
- 422 Unprocessable — validation passed but semantic failure
- 429 Too Many Requests — rate limited
- 500 Internal Server Error — unexpected
- 503 Service Unavailable — dependency down

## Error Envelope

```json
{
  "code": "STRING_CODE",
  "message": "Human-readable",
  "details": { ... },
  "request_id": "UUID"
}
```

Codes are stable identifiers (`AUTH_REQUIRED`, `VALIDATION_FAILED`, `WORKSPACE_BUDGET_EXCEEDED`). Never change code values post-release.

## Request/Response Bodies

- JSON only for public API
- `snake_case` field names (matches Python and Postgres conventions)
- Timestamps: ISO 8601 with timezone (`2026-04-23T14:00:00Z`)
- Durations: milliseconds as integers, field suffix `_ms`
- Money: NUMERIC as string for precision, field suffix `_usd`
- IDs: UUID v4 as strings
- Enums: lowercase string values
- Collections: always wrapped in `{data: [...], next_cursor, has_more}` envelope

## Pagination

Cursor-based only. Never page numbers.

```
GET /resource?limit=20&cursor=OPAQUE
Response: { data: [...], next_cursor: "OPAQUE" | null, has_more: boolean }
```

`limit` default 20, max 100. `cursor` is opaque to the client (server encodes ordering).

## Filtering

Query params named for the field being filtered: `?workspace_id=...&status=active`.
Multiple values: repeat the param: `?status=active&status=idle`.
Ranges: `?from=...&to=...` (ISO timestamps).

## Sorting

Default ordering is documented per endpoint (usually `created_at DESC`). Client-specified sorting is opt-in via `?sort=<field>&order=asc|desc`, and only on explicitly supported fields.

## Rate Limiting

- Headers on every response: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
- 429 response includes `Retry-After` header
- Limits documented per endpoint

## Authentication

- HTTP: `Authorization: Bearer <access_token>`
- WebSocket: `auth.token` in the handshake
- Refresh: `POST /auth/refresh` with refresh token in body
- No token in query strings

## Authorization

- RBAC matrix documented in [../specs/api-http.md](../specs/api-http.md)
- 403 if authenticated but not permitted
- Never leak existence via 404 vs 403 asymmetry for sensitive resources (return 404 in both cases)

## Idempotency

- Non-GET endpoints that could be retried: accept `Idempotency-Key` header (UUID from client)
- Server stores `{key → response}` for 24h; repeat requests return the same response
- Approval resolution specifically uses this pattern (see [../specs/approval-state-machine.md](../specs/approval-state-machine.md))

## WebSocket Events

- Event names: `namespace.action` (`session.connected`, `run.started`, `approval.resolved`)
- Payloads are JSON objects, never bare values
- Every server-emitted event carries `trace_id`
- Server never drops the connection for business errors — use `error` event instead

## Internal RPC

Between control-plane and cognition:

- Over HTTP (simple, traceable) rather than Redis RPC
- Headers: `X-Internal-Service`, `X-Internal-Signature`, `X-Request-Id`, `X-Trace-Id`
- Signature: HMAC-SHA256 of `method + path + body` with `vault://kairos-internal-rpc-hmac`
- Timeouts: 30s default, configurable per endpoint
- Retry on 5xx with exponential backoff; never retry 4xx

## Deprecation

- Add `Deprecation: true` header + `Sunset: <date>` header on deprecated endpoints
- Announce in `CHANGELOG.md`
- Minimum 3-month overlap before removal
- Client libraries log a warning on deprecated responses

## Documentation

- OpenAPI 3.1 spec generated from code (NestJS `@nestjs/swagger` or equivalent)
- WS events documented in [../specs/api-websocket.md](../specs/api-websocket.md)
- Every endpoint has at least one example request + response

## Safety Rules

- No endpoint mutates Layer 0 or Layer 1 state
- Internal endpoints are never exposed to the internet (enforced at the ingress layer)
- Webhook endpoints (approval webhooks) are the only publicly reachable unauthenticated endpoints — they verify via signed tokens
