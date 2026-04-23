# Approval State Machine

Normative specification. See also: [ADR-0006](../adr/0006-approval-storage.md), spec §12.

---

## States

```
    ┌──── PENDING ──────┐
    │         │         │
    ▼         ▼         ▼
APPROVED  DENIED   EXPIRED
    └─────────┴─────────┘
            (terminal)
```

Only `PENDING` transitions out. Terminal states are immutable. A database trigger enforces this — any UPDATE that would change a terminal state fails.

---

## Creation

Triggered by the policy engine when a classified tool call requires approval. Inputs:

```json
{
  "run_id": "UUID | null",
  "session_id": "UUID",
  "description": "Human-readable summary",
  "blast_radius": "install | stateful_external | destructive | network_egress_new",
  "params_preview": { ... },   // sanitized, truncated to 2KB
  "tool_id": "UUID | null"
}
```

Creation atomically:
1. Inserts row into `approvals` (state=`PENDING`, `expires_at`=now+4h default)
2. Generates webhook JWT with `jti`, signed with vault key
3. Stores `jti` in the row (not the JWT — we don't need to store it, just revocation)
4. Emits `approval:requested` on Redis → WS fan-out
5. Routes channels per user presence state (see Channel Routing below)
6. Records audit event `approval.created`

Returns `approval_id`. Caller (cognition) blocks on a Redis poll for `approval:{id}:resolved`.

---

## Channel Routing

Decided at creation time based on user presence:

| User state | Channels |
|---|---|
| No active session | `['email']` |
| Active session (heartbeat ≤ 60s ago) | `['chat']` |
| Left active session (heartbeat > 60s ago during active run) | `['chat', 'email']` |

If presence state changes during `PENDING`:
- Session becomes idle → add email channel (if not already sent)
- User returns → no change (email still valid; first resolution wins)

---

## Resolution Paths

### Via Chat (`user.approval_response` WS event)

1. WS handler receives `{approval_id, decision, note?}`
2. Validates session ownership
3. `BEGIN`
4. `SELECT ... FOR UPDATE` the approval row
5. If state ≠ `PENDING`: return current state unchanged
6. Update row: `state`, `resolved_via='chat'`, `resolved_at=NOW()`, `resolved_by=user_id`
7. Insert `jti` into `revoked_tokens`
8. `COMMIT`
9. Publish `approval:{id}:resolved` on Redis (unblocks cognition)
10. Emit `approval.resolved` WS event
11. Cancel pending email (if email channel present and send not yet flushed)
12. Audit: `approval.resolved_via_chat`

### Via Email Webhook (`GET /approvals/webhook/:token`)

1. Parse and verify JWT signature (vault key)
2. Check `jti` against `revoked_tokens` — if present → **410 Gone** with full explanation body
3. Check token `exp` — if past → **410 Gone** with `expired` outcome
4. Parse decision from token claims or query param
5. Same transaction as chat path (steps 3–10 above), with `resolved_via='email'`
6. Update chat banner via Redis (`approval.resolved`) → WS fan-out so chat UI updates
7. Return `200` with HTML confirmation page

### Via Expiry (timer)

1. Background job scans `approvals` for `state='PENDING' AND expires_at < NOW()`
2. Per row, transactional update: `state='EXPIRED'`, `resolved_via='timeout'`
3. Revoke `jti`
4. Publish `approval:{id}:resolved` (unblocks cognition with "denied by expiry")
5. Emit `approval.resolved` WS
6. Audit: `approval.expired`
7. Cognition surfaces at next natural interaction: "A pending approval for [X] expired without a response..."

Expiry default: auto-deny. Per-action-class auto-approve-on-expiry is a Layer 1 config (`approval.expiry_auto_approve.[class]=true`) requiring gate approval.

---

## 410 Gone Response Body

```json
{
  "status": "already_resolved",
  "resolved_at": "2026-04-23T14:32:11Z",
  "resolved_via": "chat",
  "outcome": "approved",
  "message": "This request was resolved at 14:32 via chat. No action taken."
}
```

Returned with `Content-Type: application/json` and a friendly HTML variant when the request's `Accept` header prefers HTML (user clicking the email link in a browser).

---

## Idempotency Guarantees

1. **At most one terminal state transition** — database trigger rejects updates that would change a terminal state
2. **At most one token use** — revoked_tokens table checked on every webhook call; insert is part of the resolution transaction
3. **Cross-channel consistency** — both channels observe the same `state` because both read from Postgros and both use the same transactional path
4. **Delivery reliability** — if the `approval.resolved` WS event is missed by a client (e.g. offline), the next fetch of `GET /approvals/:id` returns the current state

---

## Webhook Token

JWT HS256. Signed with key `vault://kairos-approval-webhook-hmac`.

Claims:
```json
{
  "iss": "kairos-control-plane",
  "sub": "approval",
  "aud": "approval-webhook",
  "jti": "UUID",
  "approval_id": "UUID",
  "iat": 1714000000,
  "exp": 1714014400,
  "decision_variants": ["approved", "denied"]
}
```

URL format: `https://kairos.vectorhost.net/api/v1/approvals/webhook/<token>?decision=approved`

Distinct URLs per decision, or a single URL with a decision query param. Implementation choice; spec allows either. Token is the same across variants — idempotency rests on the `jti`.

---

## Audit Events

| event_type | when |
|---|---|
| `approval.created` | on insert |
| `approval.routed` | per channel send |
| `approval.resolved_via_chat` | chat path |
| `approval.resolved_via_email` | email webhook |
| `approval.expired` | timer-based |
| `approval.duplicate_attempt` | 410 Gone returned |

All carry `approval_id`, `session_id`, `user_id`, `blast_radius`.

---

## Edge Cases

| Scenario | Handling |
|---|---|
| User resolves in chat, email already sent, webhook clicked → 410 with outcome |
| Email webhook clicked twice (both before in-chat resolution) → first wins, second → 410 |
| User in session, but chat WS disconnected → heartbeat still counts; `approval.requested` queued; delivered on reconnect |
| Cognition service crashed between approval resolution and tool execution → run marked `FAILED`, audit event `run.orphaned`, no retry (human decides) |
| Vault unavailable during token signing → approval creation fails with 503; cognition retries with backoff |
