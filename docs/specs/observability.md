# Observability

See [ADR-0012](../adr/0012-telemetry.md), spec §17.

---

## Trace & Span Model

OpenTelemetry-compatible. Every user interaction is one trace; every operation within it is a span.

Storage: Postgres `traces` (header) + `spans` (partitioned by day) — see [docs/specs/data-model.md](data-model.md). OTLP export to optional external collector.

Trace ID propagation:
- **HTTP**: W3C `traceparent` header
- **WebSocket**: `trace_id` field on every event payload
- **Redis pub/sub**: `trace_id` in message envelope
- **Internal RPC**: `X-Trace-Id` header

---

## Common Span Attributes

All spans carry:

| key | type | notes |
|---|---|---|
| `trace_id` | UUID | |
| `span_id` | UUID | |
| `parent_span_id` | UUID \| null | |
| `span_type` | enum | one of the types below |
| `name` | string | human-readable |
| `started_at` | timestamptz | |
| `ended_at` | timestamptz \| null | null until finished |
| `duration_ms` | integer | computed on close |
| `session_id` | UUID \| null | |
| `workspace_id` | UUID \| null | |
| `user_id` | UUID \| null | |
| `request_id` | UUID | client-supplied correlation |
| `status` | enum | `ok` \| `error` |
| `error_message` | text \| null | |

Span-type-specific attributes live in `attributes` (JSONB).

---

## Span Types

### `ego_pass`
Ego model lightweight-or-full pass.

```json
{
  "pass_kind": "lightweight | full",
  "model_id": "claude-3-5-haiku",
  "tokens_in": 420,
  "tokens_out": 180,
  "latency_ms": 732,
  "routing_decision": { "stratum": 2, "agent_role": "coder", "model_id": "claude-3-7-sonnet" },
  "mode_at_entry": "execution",
  "mode_at_exit": "execution"
}
```

### `task_dispatch`
Stratum 2/3/4 task invocation.

```json
{
  "stratum": 2,
  "agent_role": "coder",
  "model_id": "claude-3-7-sonnet",
  "provider": "anthropic",
  "tokens_in": 1850,
  "tokens_out": 612,
  "latency_ms": 4200,
  "task_type": "code_generation",
  "run_id": "uuid",
  "cost_usd": 0.0092,
  "failover_attempts": 0
}
```

### `tool_call`
Tool execution via the sandbox.

```json
{
  "tool_id": "uuid",
  "tool_name": "shell_exec",
  "tool_version": "1.0.0",
  "blast_radius": "write_local",
  "approved_by": "auto | user:UUID",
  "network_domains_accessed": ["github.com"],
  "exit_code": 0,
  "duration_ms": 1820,
  "params_hash": "sha256",
  "result_size_bytes": 412
}
```

### `memory_op`
Memory read/write.

```json
{
  "op": "recall | store | approve | delete",
  "scope": "cold",
  "query_hash": "sha256",
  "result_count": 12,
  "latency_ms": 89,
  "embedding_provider": "openai"
}
```

### `approval_event`
Approval lifecycle.

```json
{
  "approval_id": "uuid",
  "action_type": "install:package",
  "blast_radius": "install",
  "channels_notified": ["chat", "email"],
  "resolution": "APPROVED | DENIED | EXPIRED",
  "resolved_via": "chat | email | timeout",
  "time_to_resolution_ms": 23400
}
```

### `self_modification`
Layer 1/2/3 change.

```json
{
  "layer": 2,
  "change_type": "persona | theme | agent | skill | workspace | goal | self_state",
  "entity_id": "uuid",
  "triggered_by": "user | kairos | scheduler",
  "previous_value_hash": "sha256",
  "new_value_hash": "sha256",
  "rollback_available": true
}
```

### `heartbeat`
Initiative engine cycle.

```json
{
  "cycle_trigger": "scheduled | event",
  "event_type": "file_change | pr_activity | tool_health",
  "items_scanned": 14,
  "items_surfaced": 1,
  "items_queued": 3,
  "items_dropped": 10,
  "duration_ms": 210
}
```

---

## Cost Attribution

Every `task_dispatch` span contributes to cost reporting. Aggregation views:

```sql
-- Cost per session
SELECT session_id, SUM((attributes->>'cost_usd')::numeric) AS cost
FROM spans
WHERE span_type = 'task_dispatch'
  AND started_at BETWEEN ? AND ?
GROUP BY session_id;

-- Cost per workspace per day
SELECT workspace_id, DATE_TRUNC('day', started_at) AS day,
       SUM((attributes->>'cost_usd')::numeric) AS cost
FROM spans
WHERE span_type = 'task_dispatch'
  AND started_at BETWEEN ? AND ?
GROUP BY workspace_id, day;

-- Cost per stratum
SELECT (attributes->>'stratum')::int AS stratum,
       SUM((attributes->>'cost_usd')::numeric) AS cost,
       COUNT(*) AS calls
FROM spans
WHERE span_type = 'task_dispatch'
GROUP BY stratum;
```

Exposed via `GET /costs/summary` with query-param grouping.

---

## Retention & Partitioning

- `spans` partitioned by `DATE(started_at)`
- Full retention: 90 days
- Archive: JSONL export to MinIO before partition drop
- `traces` header: same retention as its spans

---

## OTLP Export (Optional)

Env-controlled. When `OTEL_EXPORTER_OTLP_ENDPOINT` is set:
- Control plane (TS) uses `@opentelemetry/exporter-trace-otlp-http`
- Cognition (Python) uses `opentelemetry-exporter-otlp-proto-http`
- Both mirror the Postgres-written spans

Authentication: `OTEL_EXPORTER_OTLP_HEADERS` (e.g., `Authorization=Bearer ...`). Never from LLM context.

---

## Frontend Trace Viewer

Right-panel "Trace" tab reads `GET /traces/:id` and renders:
- Waterfall of spans by start time
- Color code per span type
- Click for span attributes
- Cost rollup at the top

---

## Metrics (Phase 6)

Core metrics scraped by Prometheus in Phase 6 (deferred):

- `kairos_run_latency_ms{stratum,role}` histogram
- `kairos_tool_call_latency_ms{tool}` histogram
- `kairos_approval_resolution_ms{channel,outcome}` histogram
- `kairos_initiative_surface_rate` counter
- `kairos_layer_change_total{layer}` counter
- `kairos_cost_usd_total{workspace,stratum}` counter
- `kairos_vault_access_total{alias}` counter
- `kairos_sandbox_exec_duration_ms` histogram
