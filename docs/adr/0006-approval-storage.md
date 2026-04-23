# ADR-0006: Approval Storage

Status: Accepted  
Date: 2026-04-23

## Context

The approval state machine requires:
- Durable record of every request, its state, and its resolution
- Real-time delivery to in-chat clients (WebSocket)
- Email channel with webhook callbacks
- Cryptographic single-use tokens
- Idempotency across channels (second resolution returns 410 Gone)

## Decision

**Two-store model**:
- **Postgres** (`approvals` table) — durable, queryable, source of truth for state
- **Redis pub/sub** (`approval:{id}` channels) — real-time fan-out to WS clients and cross-service notification

Flow:
1. Cognition requests approval → policy engine creates row in `approvals` (state `PENDING`)
2. Control plane publishes `approval:requested` on Redis → WS gateway fans out to session room
3. Email channel (if applicable) sends message with signed webhook URL
4. Resolution (webhook OR WS event) → atomic Postgres transaction transitions state and invalidates token
5. Control plane publishes `approval:resolved` on Redis → all listeners update (cognition unblocks, frontend updates banner, pending email sends cancelled)

Webhook tokens are JWT (HS256) with `jti`, signed with a key from the vault. On resolution, the `jti` is added to a Postgres `revoked_tokens` table checked on every webhook call. Second attempts fail the check → 410 Gone.

## Consequences

**Easier**:
- Durable audit trail without separate "approval log" — the state table is the log (append-only via trigger that prevents state regression)
- Real-time UX without polling
- Cross-service notification (cognition must unblock when user approves via email) works through a simple Redis subscription

**Harder**:
- Redis goes down → degraded real-time delivery but not correctness (Postgres is still source of truth)
- JWT revocation list is a DB call per webhook — fine at expected scale

## Alternatives Considered

- **Redis only**: Not durable enough for audit. Rejected.
- **Postgres LISTEN/NOTIFY**: Works, but Redis is already in the stack for BullMQ. Fewer moving parts with Redis.
- **Kafka/event stream**: Overkill at this scale. Revisit in Phase 6 if we ever need multi-consumer event replay.
