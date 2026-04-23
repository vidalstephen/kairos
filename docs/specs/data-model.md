# Data Model

Authoritative entity catalog for Kairos. All tables live in a single Postgres database (`kairos`). Migrations numbered sequentially under `services/control-plane/src/database/migrations/`.

> **Note**: Column types use standard Postgres names. `UUID` = `uuid` with `gen_random_uuid()` default unless stated. `TIMESTAMPTZ` columns use `NOW()` default.

---

## Entity Relationship Overview

```
users ─┬─< refresh_tokens
       │
       ├─< workspace_members >─ workspaces ─┬─< sessions ─┬─< messages
       │                                    │             │
       │                                    │             └─< runs ─< run_traces
       │                                    │                      └─< tool_executions
       │                                    │
       │                                    ├─< memory_entries
       │                                    ├─< goals
       │                                    ├─< self_state_snapshots
       │                                    ├─< approvals
       │                                    ├─< personas
       │                                    ├─< themes
       │                                    ├─< agents
       │                                    └─< skills
       │
       └─< audit_events
                            capabilities    credential_access_log
                            tools           traces ─< spans
                            tool_registry
```

---

## Core Identity

### `users`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| email | CITEXT UNIQUE NOT NULL | |
| password_hash | TEXT NOT NULL | bcrypt cost 12 |
| display_name | TEXT | |
| role | user_role ENUM | `OWNER\|ADMIN\|OPERATOR\|VIEWER` |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `refresh_tokens`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| user_id | UUID FK users | |
| token_hash | TEXT NOT NULL | SHA-256 of token |
| expires_at | TIMESTAMPTZ | 7 days from issue |
| revoked_at | TIMESTAMPTZ NULL | |
| created_at | TIMESTAMPTZ | |

---

## Workspaces

### `workspaces`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT NOT NULL | |
| description | TEXT | |
| settings | JSONB NOT NULL DEFAULT '{}' | allow_pii, default_model, role_models, budgets, retention |
| default_agent_id | UUID FK agents NULL | |
| created_by | UUID FK users | |
| created_at | TIMESTAMPTZ | |
| deleted_at | TIMESTAMPTZ NULL | soft-delete; 30-day retention |

### `workspace_members`
| column | type | notes |
|---|---|---|
| workspace_id | UUID FK workspaces | |
| user_id | UUID FK users | |
| role | member_role ENUM | `OWNER\|ADMIN\|OPERATOR\|VIEWER` |
| added_at | TIMESTAMPTZ | |
| PK | (workspace_id, user_id) | |

---

## Sessions & Messages

### `sessions`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| workspace_id | UUID FK workspaces | |
| user_id | UUID FK users | session owner |
| status | session_status ENUM | `ACTIVE\|IDLE\|CLOSED\|EXPIRED` |
| agent_id | UUID FK agents NULL | active agent |
| persona_id | UUID FK personas NULL | active persona |
| mode | session_mode ENUM | `design\|execution\|research\|review\|idle` |
| presence_last_ping_at | TIMESTAMPTZ NULL | |
| metadata | JSONB NOT NULL DEFAULT '{}' | briefing snapshot, etc. |
| started_at | TIMESTAMPTZ | |
| ended_at | TIMESTAMPTZ NULL | |

### `messages`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| session_id | UUID FK sessions | |
| role | message_role ENUM | `user\|assistant\|system\|tool` |
| content | TEXT NOT NULL | |
| model_id | TEXT NULL | stratum + model |
| tool_calls | JSONB NULL | if role=assistant |
| tool_call_id | UUID NULL | if role=tool |
| metadata | JSONB DEFAULT '{}' | |
| created_at | TIMESTAMPTZ | |

---

## Runs & Traces

### `runs`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| session_id | UUID FK sessions | |
| parent_run_id | UUID FK runs NULL | for delegation |
| workspace_id | UUID FK workspaces | |
| agent_role | TEXT NOT NULL | executor, planner, etc. |
| model_id | TEXT NOT NULL | |
| status | run_status ENUM | `QUEUED\|RUNNING\|COMPLETED\|FAILED\|CANCELLED\|TIMED_OUT` |
| tokens_in | INT DEFAULT 0 | |
| tokens_out | INT DEFAULT 0 | |
| budget_tokens | INT | |
| budget_time_ms | INT | |
| cost_usd | NUMERIC(12,6) | |
| started_at | TIMESTAMPTZ | |
| ended_at | TIMESTAMPTZ NULL | |
| error | JSONB NULL | |

### `run_traces`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| run_id | UUID FK runs | |
| event_type | TEXT | model_call, tool_invocation, delegation, etc. |
| payload | JSONB | |
| created_at | TIMESTAMPTZ | |

---

## Tools

### `tool_registry`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT UNIQUE NOT NULL | `^[a-z][a-z0-9_]*$` |
| version | TEXT NOT NULL | semver |
| manifest | JSONB NOT NULL | params schema, capabilities, network policy |
| tier | tool_tier ENUM | `T0\|T1\|T2\|T3` (blast radius shorthand) |
| enabled | BOOLEAN DEFAULT true | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

### `tool_executions`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| run_id | UUID FK runs | |
| tool_id | UUID FK tool_registry | |
| capability_token | TEXT NOT NULL | HMAC-signed, single-use |
| params | JSONB | pre-sanitized |
| result | JSONB NULL | post-sanitized |
| status | tool_exec_status ENUM | `PENDING\|EXECUTING\|COMPLETED\|FAILED\|REJECTED` |
| blast_radius | blast_radius ENUM | |
| approved_via | TEXT | auto\|user_id |
| duration_ms | INT | |
| network_domains_accessed | TEXT[] | |
| exit_code | INT | |
| created_at | TIMESTAMPTZ | |
| completed_at | TIMESTAMPTZ | |

---

## Memory

### `memory_entries`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| workspace_id | UUID FK workspaces | |
| session_id | UUID FK sessions NULL | |
| scope | memory_scope ENUM | `hot\|warm\|cold\|global` |
| sensitivity | sensitivity_level ENUM | `public\|internal\|confidential\|secret` |
| approval_state | approval_state ENUM | `auto\|pending\|approved\|rejected` |
| source_type | TEXT | `session_summary\|fact\|doc\|tool_result\|self_observation` |
| content | TEXT NOT NULL | |
| fts_vector | TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED | |
| embedding | VECTOR(1536) | pgvector |
| metadata | JSONB DEFAULT '{}' | |
| expires_at | TIMESTAMPTZ NULL | |
| created_at | TIMESTAMPTZ | |

Indexes: HNSW on `embedding`, GIN on `fts_vector`, B-tree on (workspace_id, scope, created_at).

---

## Self-State

### `self_state_snapshots`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| workspace_id | UUID FK workspaces NULL | NULL for global |
| session_id | UUID FK sessions NULL | the session that caused the write |
| version | INTEGER NOT NULL | monotonic per workspace |
| markdown | TEXT NOT NULL | source of truth |
| shadow_json | JSONB NOT NULL | derived |
| triggered_by | TEXT | `session_open\|session_close\|layer_change\|event\|scheduled` |
| created_at | TIMESTAMPTZ | |

UNIQUE (workspace_id, version). Append-only via trigger.

### `goals`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| workspace_id | UUID FK workspaces NULL | NULL = global |
| description | TEXT NOT NULL | |
| priority | goal_priority ENUM | `critical\|high\|normal\|low` |
| status | goal_status ENUM | `active\|standing\|paused\|complete` |
| trigger_type | TEXT | null\|scheduled\|event |
| trigger_config | JSONB | interval or event type |
| last_touched | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |

---

## Approvals

### `approvals`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| run_id | UUID FK runs NULL | |
| session_id | UUID FK sessions NULL | |
| state | approval_state_machine ENUM | `PENDING\|APPROVED\|DENIED\|EXPIRED` |
| description | TEXT NOT NULL | |
| blast_radius | blast_radius ENUM | |
| channels_notified | TEXT[] | `['email','chat']` |
| resolved_via | TEXT NULL | `chat\|email\|timeout\|admin` |
| resolved_at | TIMESTAMPTZ NULL | |
| resolved_by | UUID FK users NULL | |
| webhook_token_jti | UUID UNIQUE | JWT id |
| webhook_token_expires_at | TIMESTAMPTZ | 4h default |
| chat_notification_id | TEXT NULL | WS event correlation |
| created_at | TIMESTAMPTZ | |
| expires_at | TIMESTAMPTZ | |

### `revoked_tokens`
| column | type | notes |
|---|---|---|
| jti | UUID PK | |
| revoked_at | TIMESTAMPTZ | |

Append-only. Checked on every webhook call.

---

## Audit

### `audit_events`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| category | audit_category ENUM | `auth\|run\|tool\|memory\|policy\|approval\|system\|self_modification` |
| event_type | TEXT | granular event |
| user_id | UUID FK users NULL | |
| workspace_id | UUID FK workspaces NULL | |
| session_id | UUID FK sessions NULL | |
| run_id | UUID FK runs NULL | |
| details | JSONB | |
| request_id | TEXT | trace correlation |
| created_at | TIMESTAMPTZ | |

Append-only via trigger. 90d in Postgres, then archived to MinIO as JSONL.

---

## Capabilities & Credentials

### `capabilities`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT NOT NULL | |
| version | TEXT | |
| install_hash | TEXT | |
| blast_radius | blast_radius ENUM | |
| approved_domains | TEXT[] | |
| installed_at | TIMESTAMPTZ | |
| approved_by | TEXT | `permanent\|user_id` |
| review_date | TIMESTAMPTZ | |
| status | TEXT | active\|deprecated |

### `credential_access_log`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| alias | TEXT NOT NULL | never the raw value |
| caller_service | TEXT NOT NULL | `control-plane\|cognition\|executor` |
| purpose | TEXT NOT NULL | |
| run_id | UUID NULL | |
| tool_execution_id | UUID NULL | |
| created_at | TIMESTAMPTZ | |

(Credential values themselves live in the vault, not in Postgres.)

---

## Layer 2 Owned State

### `personas`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| workspace_id | UUID FK workspaces NULL | NULL = global |
| name | TEXT NOT NULL | |
| markdown | TEXT NOT NULL | full persona doc w/ frontmatter |
| version | INTEGER | |
| active | BOOLEAN | |
| created_at | TIMESTAMPTZ | |

### `themes`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT NOT NULL | |
| spec | JSONB NOT NULL | colors, typography, density |
| generated_by | TEXT | `kairos\|user` |
| based_on | TEXT | parent theme name |
| created_at | TIMESTAMPTZ | |

### `agents`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT NOT NULL | |
| workspace_id | UUID FK workspaces NULL | affinity |
| config | JSONB NOT NULL | persona ref, model_assignments, tool_permissions, memory_scope |
| created_by | TEXT | `kairos\|user` |
| created_at | TIMESTAMPTZ | |
| version | INTEGER | |

### `skills`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| name | TEXT UNIQUE | |
| markdown | TEXT NOT NULL | SKILL.md body |
| source | TEXT | `core\|installed\|kairos_authored` |
| version | INTEGER | |
| enabled | BOOLEAN | |
| created_at | TIMESTAMPTZ | |

---

## Observability

### `traces`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| session_id | UUID FK sessions NULL | |
| root_span_id | UUID | |
| started_at | TIMESTAMPTZ | |
| ended_at | TIMESTAMPTZ NULL | |

### `spans`
| column | type | notes |
|---|---|---|
| id | UUID PK | |
| trace_id | UUID FK traces | |
| parent_span_id | UUID FK spans NULL | |
| span_type | span_type ENUM | `ego_pass\|task_dispatch\|tool_call\|memory_op\|approval_event\|self_modification\|heartbeat` |
| name | TEXT | |
| started_at | TIMESTAMPTZ | |
| ended_at | TIMESTAMPTZ NULL | |
| duration_ms | INT | computed |
| attributes | JSONB | typed per span_type |
| status | TEXT | `ok\|error` |
| error_message | TEXT NULL | |

Partitioned by day. 90d retention; archived to MinIO before drop.

---

## Enum Summary

```
user_role            OWNER | ADMIN | OPERATOR | VIEWER
member_role          OWNER | ADMIN | OPERATOR | VIEWER
session_status       ACTIVE | IDLE | CLOSED | EXPIRED
session_mode         design | execution | research | review | idle
message_role         user | assistant | system | tool
run_status           QUEUED | RUNNING | COMPLETED | FAILED | CANCELLED | TIMED_OUT
tool_tier            T0 | T1 | T2 | T3
tool_exec_status     PENDING | EXECUTING | COMPLETED | FAILED | REJECTED
blast_radius         read | write_local | install | stateful_external | destructive | network_egress_new
memory_scope         hot | warm | cold | global
sensitivity_level    public | internal | confidential | secret
approval_state       auto | pending | approved | rejected         -- memory write-policy
approval_state_machine  PENDING | APPROVED | DENIED | EXPIRED     -- approval_system
goal_priority        critical | high | normal | low
goal_status          active | standing | paused | complete
audit_category       auth | run | tool | memory | policy | approval | system | self_modification
span_type            ego_pass | task_dispatch | tool_call | memory_op | approval_event | self_modification | heartbeat
```

## Migration Order (Phase 1+)

```
001_initial_schema.sql              users, refresh_tokens, enums
002_workspaces.sql                  workspaces, workspace_members
003_sessions_and_messages.sql       sessions, messages
004_runs_and_traces.sql             runs, run_traces
005_tools.sql                       tool_registry, tool_executions
006_memory.sql                      memory_entries (pgvector ext)
007_self_state.sql                  self_state_snapshots, goals
008_approvals.sql                   approvals, revoked_tokens
009_audit.sql                       audit_events
010_capabilities.sql                capabilities, credential_access_log
011_layer_2.sql                     personas, themes, agents, skills
012_observability.sql               traces, spans (partitioned)
```
