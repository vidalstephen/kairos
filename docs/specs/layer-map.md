# Layer Map

Kairos holds its own mutability as first-class self-knowledge. See spec §4.

---

## Layer 0 — Immutable Core

Access: **invoke-only**. Not readable, not modifiable from any prompt or self-modification path.

Contents:
- Execution engine (run dispatcher, queue, scheduler)
- Policy engine (blast radius classifier, approval gate)
- Approval state machine (state transitions, token minting, webhook verify)
- Credential vault interface (alias resolver, access log)
- Sandbox enforcement (executor lifecycle, resource quotas, tmpfs, network isolation)
- Network egress control (allowlist/review/block decisions)
- Blast radius classifier (deterministic classification rules)

Code location: `services/control-plane/src/modules/{policy,approvals,vault,audit,runs,tools/sandbox-service}`.

Modification protocol: code change in the repo, reviewed by two humans, ADR updated. Kairos cannot propose a Layer 0 change; only humans can.

---

## Layer 1 — Structural (Gate-Protected)

Access: **propose-with-gate**. Kairos can draft a change proposal; execution requires explicit human approval.

Contents:
- System prompt core foundations (the base templates Kairos uses at Stratum 1 and 2)
- Ego model configuration (model choice, budgets, pass schedules)
- Approval routing rules (channel selection logic inputs)
- Trust escalation thresholds (when to prompt, when to auto-approve)
- Model role assignments (stratum defaults, fallback chains)
- Presence heartbeat timing

Storage: `layer_1_config` table in Postgres (single row, versioned via append-only history); effective value resolved by service on startup and on explicit reload command.

Change flow:
1. Ego drafts proposal: `{ key, current_value, proposed_value, rationale, risk_surface }`
2. Approval created (tier: stateful_external)
3. Human approves → new row in `layer_1_config_history`; `layer_1_config` row updated; services notified via Redis `config:reload`
4. Audit: `self_modification.layer_1`

---

## Layer 2 — Identity (Kairos-Owned, Logged)

Access: **kairos-owned**. Kairos modifies autonomously. Every change versioned, logged, reversible.

Contents:
- Persona definitions (`personas` table)
- Theme specs (`themes` table)
- Agent roster (`agents` table)
- Skill library (`skills` table)
- Workspace definitions (`workspaces` table, non-settings fields)
- Named identity attributes

Change flow:
1. Kairos initiates (direct or user-requested)
2. Validation (conflict check, circular-dependency check)
3. Insert new row or bump `version` (previous row retained)
4. Update `self_state_snapshots` (identity section)
5. Notify user (brief, confident, in current voice)
6. Audit: `self_modification.layer_2`

Rollback:
- User command or Kairos command → restore previous row (versioned)
- Always available for every Layer 2 entity

---

## Layer 3 — Working State (Kairos-Owned, Ephemeral)

Access: **read-write-continuous**. No approval overhead, full snapshots at boundaries.

Contents:
- Self-state document (`self_state_snapshots`)
- Goal register (`goals`)
- Task graph (`runs` delegation tree, `run_traces`)
- Session context (`sessions`, `messages`)
- Relationship posture (embedded in self-state)
- Active workspace (per-session)
- Pending proactive items (embedded in self-state)

Full snapshots at:
- Session open/close
- Mode transitions
- Goal status changes
- Agent/workspace/persona switches

---

## No-Go Contract

When a request would touch Layer 0, Kairos does **not**:
- Attempt and fail silently
- Over-apologize
- Say "I can't do that" without explanation

Kairos **does**:
- Identify exactly which Layer 0 function is involved
- Explain why that function exists as protected
- Offer the closest available alternative within its layer

See spec §18 for example exchanges.

---

## Layer Awareness in Self-State

The self-state document contains a `layer_awareness` section populated from this spec:

```yaml
layer_awareness:
  immutable:      # Layer 0
    - execution_engine
    - policy_engine
    - approval_state_machine
    - credential_vault_interface
    - sandbox_enforcement
    - network_egress_control
    - blast_radius_classifier
  gate_protected: # Layer 1
    - system_prompt_core
    - ego_model_config
    - approval_routing_rules
    - trust_escalation_thresholds
    - model_role_assignments
  owned:          # Layer 2
    - persona_store
    - theme_store
    - agent_roster
    - skill_library
    - workspace_definitions
  working:        # Layer 3
    - self_state_document
    - goal_register
    - task_graph
    - session_context
    - relationship_posture
```

This block is static (seeded at first startup) but can be extended as new Layer 2 stores are introduced.

---

## Change Audit Format

Every layer change writes an `audit_events` row with `category='self_modification'`:

```json
{
  "category": "self_modification",
  "event_type": "layer_2.persona.create",
  "details": {
    "layer": 2,
    "entity": "persona",
    "entity_id": "uuid",
    "previous_value_hash": "sha256",
    "new_value_hash": "sha256",
    "triggered_by": "kairos | user:{id} | scheduler",
    "rollback_available": true
  }
}
```

`previous_value_hash` is null for creation. `rollback_available` is always true for L2.
