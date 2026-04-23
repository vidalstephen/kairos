# ADR-0012: Telemetry via OTel with Postgres Backing Store

Status: Accepted  
Date: 2026-04-23

## Context

The spec (§17) requires OpenTelemetry-compatible spans for every operation, with typed attributes per span type (ego_pass, task_dispatch, tool_call, memory_op, approval_event, self_modification, heartbeat). It also requires cost attribution per task/session/workspace/stratum.

We want traces to be queryable for debugging and for cost reporting — not just dumped to a vendor.

## Decision

**Two-track telemetry:**

1. **Custom `traces` and `spans` tables in Postgres** — our authoritative, queryable store. Every span Kairos emits writes here. Schema mirrors OTel span conventions with additional `span_type`-specific typed attribute tables for cost attribution and self-modification audit.

2. **OTLP export** — a background exporter that ships the same spans to an external OTel collector (Jaeger/Grafana Tempo/etc.) when configured via env. Optional in dev, wired-up in prod.

Tracing SDK: OpenTelemetry SDK in both TypeScript (control plane) and Python (cognition). Common trace_id propagation via HTTP headers (W3C Trace Context) and WebSocket message fields.

## Consequences

**Easier**:
- Cost reports are SQL queries against `task_dispatch_spans` joined with `sessions`/`workspaces` — no vendor tool needed
- Trace viewer in the frontend reads from our own tables — no external dependency for the core UX
- Self-modification audit and blast-radius statistics fall out of the same data

**Harder**:
- Span volume is high — partitioning and retention policies needed (Postgres partitions by day; default 90d retention; archived to S3 before drop)
- We re-implement the narrow slice of OTel viewer functionality (mitigation: small and well-scoped)

## Alternatives Considered

- **OTel collector + external backend only**: Fast to stand up, but cost queries need a separate path. We'd end up with two data stores anyway.
- **Log-based tracing (structured logs only)**: Works at small scale but spans need explicit start/end and parent/child — a separate model is clearer.
