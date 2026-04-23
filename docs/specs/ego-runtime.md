# Ego Runtime Contract

The Ego model is Stratum 1. It runs as the long-lived core of the cognition service. This document is the normative behavior contract.

---

## Invocation Schedules

### Lightweight Pass — every user message

Trigger: each incoming `user.message` for a session the Ego is attending.

Inputs: current self-state (cached in memory), last 3 messages, workspace context, new user content.

Outputs:
- Routing decision (stratum + model + agent role)
- Updated mode assessment (if transition detected)
- Updates to proactive item queue (if new signals)
- Updates to open questions
- Updates to relationship posture signals

Budget: <500 input tokens, <200 output tokens, <1s latency target.

No full self-state write. In-memory updates are staged and flushed on session close or significant event.

### Full Self-State Update — event-driven

Triggers:
- Session open
- Session close
- Mode transition crossing threshold
- Goal status change
- Agent/workspace/persona/theme switch
- Capability install or removal
- Approval resolution
- Initiative threshold recalibration

Inputs: staged in-memory deltas + current snapshot.

Outputs: new row in `self_state_snapshots`; audit event; WS `self_state.updated` event.

### Proactive Loop — scheduled + event

Heartbeat: every 15 minutes (configurable Layer 1 param, `initiative.heartbeat_interval`).
Event triggers: file change, email received, PR activity, goal dependency resolved, tool health change.

Evaluates goal register and pending proactive items. Scores each candidate. Surfaces per the initiative engine (see [docs/specs/observability.md](observability.md) and spec §14).

---

## Routing Decision Matrix

The Ego decides where each task goes. Decision inputs:

| Signal | Effect |
|---|---|
| Short answer, direct question | Answer in-line (Ego itself) |
| Multi-step plan or decomposition needed | Stratum 2 (Reasoning) |
| Code generation / review | Stratum 3 — coder specialist |
| Research / synthesis | Stratum 3 — researcher specialist |
| Document processing | Stratum 3 — doc specialist |
| Browser task | Stratum 3 — browser_operator |
| Memory compaction / scoring / extraction | Stratum 4 — utility |
| Explicit user-requested role | Use that role |

Role models resolution chain (per workspace):
1. Explicit request
2. `workspace.settings.role_models[agent_role]`
3. `workspace.settings.default_model`
4. Global `DEFAULT_MODEL` config

## Output Re-Voicing Pipeline

Every task output passes through the Ego before delivery:

```
1. RECEIVE task result
2. EVALUATE structural correctness (does it answer the task?)
   If no: either retry with better brief or surface as error
3. STRIP task-model artifacts:
   - Internal reasoning traces (XML thinking blocks, etc.)
   - Raw tool outputs beyond what the user needs
   - Task-model persona leakage
4. FRAME with session context:
   - Current mode
   - Recent conversation
   - Workspace framing
5. RE-VOICE in current persona's voice and tone
6. ADD links/attribution where relevant
7. DELIVER via `agent.response` WS event
```

Re-voicing is short for simple outputs (a quick Ego pass) and can itself invoke a Stratum 1 call for longer outputs.

## Context Injection Rules

Task models receive only what they need. The Ego composes per-task context:

| Task model receives | Task model NEVER receives |
|---|---|
| Task brief | Self-state document |
| Minimal relevant conversation snippets | Goal register |
| Tool schemas for allowed tools only | Relationship posture (except as inferred from brief) |
| Workspace hints relevant to the task | Persona definition |
| Relevant memory fragments | Layer map |
| Output format specification | Full session history |

## Session Open Sequence

```
1. LOAD   — read self-state (latest snapshot), diff from last session
2. ASSESS — mode reassessment (elapsed time, inflight tasks, queued items)
3. TOOL HEALTH CHECK — lightweight pings, update self-state
4. PROACTIVE REVIEW — items that crossed threshold while closed
5. POSTURE GENERATION — internal framing (not surfaced unless relevant)
6. BRIEFING COMPOSITION — voiced opening from Ego based on #1–#5
7. HEARTBEAT START — begin monitoring client presence
8. READY — emit `session.connected` + `briefing.delivered`
```

## Session Close Sequence

```
1. SUMMARIZE — write session summary (utility worker)
2. UPDATE GOAL REGISTER — progress signals on active goals
3. CAPTURE OPEN QUESTIONS — persist unresolved
4. UPDATE RELATIONSHIP POSTURE — signal extraction
5. MODE ASSESSMENT — update mode_context for next open
6. WRITE SNAPSHOT — new self-state version
7. IN-FLIGHT TRANSITION — active tasks → async mode (approval routing → email)
8. HEARTBEAT STOP
```

## Error Handling

- Task model failure → Ego decides: retry with adjusted brief, fail gracefully with user-facing explanation, or escalate to Stratum 2 for alternative planning
- Tool failure → Ego surfaces the failure honestly, does not hallucinate success
- Self-state write failure → critical: retry with backoff, log, surface to operations. The Ego must never continue as if a write succeeded when it didn't.

## Concurrency

- One Ego pass per session at a time (mutex on `session_id`)
- Proactive loop runs independently of session locks
- Utility workers are freely parallel

## Persistence of Ego Working Set

The Ego's in-memory state (staged deltas, routing cache, recent messages) is re-derivable from Postgres. On cognition service restart, sessions resume from the last snapshot; in-flight runs are cancelled with a user-visible note.

## Configuration Surface (Layer 1)

| Key | Default |
|---|---|
| `ego.model` | `claude-3-5-haiku` |
| `ego.pass_token_budget_in` | 500 |
| `ego.pass_token_budget_out` | 200 |
| `ego.pass_latency_target_ms` | 1000 |
| `initiative.heartbeat_interval` | `15m` |
| `initiative.surface_threshold` | 0.8 |
| `initiative.queue_threshold` | 0.5 |
| `presence.heartbeat_absence_ms` | 60000 |
| `session.idle_expiry_hours` | 24 |

Changes to any of these require Layer 1 gate approval.
