# Self-State Schema

The self-state document is Markdown (source of truth) + a derived JSON shadow store for programmatic access. See [ADR-0003](../adr/0003-self-state-format.md).

## Markdown Template

```markdown
# Kairos Self-State
_last_updated: 2026-04-23T14:00:00Z
_version: 42
_session_id: SESSION_UUID
_workspace_id: WORKSPACE_UUID | null

## Identity
persona: STRING
voice: STRING
current_theme: STRING
active_agent: STRING
active_workspace: STRING

## Current Mode
mode: design | execution | research | review | idle
mode_since: 2026-04-23T12:00:00Z
mode_context: STRING

## Goal Register
- id: goal_UUID
  description: STRING
  priority: critical | high | normal | low
  status: active | standing | paused | complete
  last_touched: ISO8601
  trigger: null | scheduled/INTERVAL | event/TYPE

## Open Questions
- STRING

## Relationship Posture
user: STRING
working_style: STRING
current_engagement: STRING
last_session_summary: STRING

## Tool Health
- name: STRING
  status: healthy | degraded | unavailable
  last_checked: ISO8601

## Pending Proactive Items
- item: STRING
  threshold_score: 0.0..1.0
  surface_at: next_natural_opportunity | session_open | immediate

## Capability Manifest
- name: STRING
  type: core | installed
  installed_at: ISO8601 | null
  approved_by: permanent | USER_ID
  purpose: STRING
  approved_domains: [STRING]

## Layer Awareness
immutable: [STRING]
gate_protected: [STRING]
owned: [STRING]
working: [STRING]
```

## JSON Shadow Schema

`packages/schemas/self-state.schema.json`:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "type": "object",
  "required": ["version", "last_updated", "identity", "mode", "goal_register", "tool_health", "capability_manifest", "layer_awareness"],
  "properties": {
    "version": { "type": "integer", "minimum": 1 },
    "last_updated": { "type": "string", "format": "date-time" },
    "session_id": { "type": "string", "format": "uuid" },
    "workspace_id": { "type": ["string", "null"], "format": "uuid" },
    "identity": {
      "type": "object",
      "required": ["persona", "voice", "current_theme", "active_agent", "active_workspace"],
      "properties": {
        "persona": { "type": "string" },
        "voice": { "type": "string" },
        "current_theme": { "type": "string" },
        "active_agent": { "type": "string" },
        "active_workspace": { "type": "string" }
      }
    },
    "mode": {
      "type": "object",
      "required": ["value", "since"],
      "properties": {
        "value": { "enum": ["design", "execution", "research", "review", "idle"] },
        "since": { "type": "string", "format": "date-time" },
        "context": { "type": "string" }
      }
    },
    "goal_register": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["id", "description", "priority", "status"],
        "properties": {
          "id": { "type": "string", "format": "uuid" },
          "description": { "type": "string" },
          "priority": { "enum": ["critical", "high", "normal", "low"] },
          "status": { "enum": ["active", "standing", "paused", "complete"] },
          "last_touched": { "type": "string", "format": "date-time" },
          "trigger": { "type": ["string", "null"] }
        }
      }
    },
    "open_questions": { "type": "array", "items": { "type": "string" } },
    "relationship_posture": {
      "type": "object",
      "properties": {
        "user": { "type": "string" },
        "working_style": { "type": "string" },
        "current_engagement": { "type": "string" },
        "last_session_summary": { "type": "string" }
      }
    },
    "tool_health": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "status", "last_checked"],
        "properties": {
          "name": { "type": "string" },
          "status": { "enum": ["healthy", "degraded", "unavailable"] },
          "last_checked": { "type": "string", "format": "date-time" }
        }
      }
    },
    "pending_proactive_items": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["item", "threshold_score", "surface_at"],
        "properties": {
          "item": { "type": "string" },
          "threshold_score": { "type": "number", "minimum": 0, "maximum": 1 },
          "surface_at": { "enum": ["immediate", "next_natural_opportunity", "session_open"] }
        }
      }
    },
    "capability_manifest": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "type", "purpose"],
        "properties": {
          "name": { "type": "string" },
          "type": { "enum": ["core", "installed"] },
          "installed_at": { "type": ["string", "null"], "format": "date-time" },
          "approved_by": { "type": "string" },
          "purpose": { "type": "string" },
          "approved_domains": { "type": "array", "items": { "type": "string" } }
        }
      }
    },
    "layer_awareness": {
      "type": "object",
      "required": ["immutable", "gate_protected", "owned", "working"],
      "properties": {
        "immutable": { "type": "array", "items": { "type": "string" } },
        "gate_protected": { "type": "array", "items": { "type": "string" } },
        "owned": { "type": "array", "items": { "type": "string" } },
        "working": { "type": "array", "items": { "type": "string" } }
      }
    }
  }
}
```

## Write Protocol

1. Caller (Ego process) builds a new Markdown document from current state
2. Parser derives JSON shadow and validates against schema
3. If validation fails: abort, log error, do not write
4. Insert new row in `self_state_snapshots` with monotonic `version` (workspace-scoped)
5. Emit `self_state.updated` WS event to subscribers
6. Fire `self_modification` audit event with previous and new version

## Read Protocol

- **Current**: `SELECT * FROM self_state_snapshots WHERE workspace_id=? ORDER BY version DESC LIMIT 1`
- **Historical**: by version
- **Diff**: computed on demand using JSON shadow diff (see `services/control-plane/src/modules/self-state/diff.ts`)

## Version Increment Rules

- Workspace-scoped: each workspace has its own version sequence
- Global (workspace_id NULL): single version sequence
- Monotonic: enforced by a trigger; writing with a non-next version fails
- Append-only: update/delete attempts rejected by trigger

## Snapshot Retention

- Full history for 90 days
- Compacted to summary after 90 days by a utility worker job (spec §7.1)
- Never truly deleted — summary form is permanent
