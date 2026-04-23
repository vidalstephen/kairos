# Glossary

Normative terms used throughout the Kairos codebase and documentation. Defined here; referenced everywhere.

---

## Core Cognition

**Ego (Ego Model / Ego Process)**  
The persistent inner life of Kairos. A small, fast, always-running model whose responsibility is self-state continuity, routing work to task models, re-voicing outputs, and running the initiative loop. The Ego is the center of gravity — task models orbit it. See [docs/specs/ego-runtime.md](specs/ego-runtime.md).

**Stratum 1 / Stratum 2 / Stratum 3 / Stratum 4**  
The four tiers of the model topology:
- **Stratum 1** — Ego. Persistent self. Haiku-class.
- **Stratum 2** — Reasoning. Deep planning on demand. Sonnet/Opus/GPT-4o-class.
- **Stratum 3** — Specialist. Domain execution (code, research, docs, browser).
- **Stratum 4** — Utility workers. Compaction, scoring, extraction. Cheapest tier.

**Re-voicing**  
The Ego's process of taking a task model's output, stripping task-model artifacts, and rendering the content in the Ego's current persona voice before delivery. Every output passes through re-voicing.

**Context Isolation Rule**  
Task models never receive the self-state document, goal register, relationship posture, persona definition, or layer map. The Ego selects only what each task requires.

---

## Self-Model

**Self-State Document**  
The Ego's working memory of itself. A versioned Markdown file with a JSON shadow store. Contains identity, current mode, goal register, open questions, relationship posture, tool health, pending proactive items, capability manifest, and layer awareness. Read at session open, written at session close and significant events. See [docs/specs/self-state-schema.md](specs/self-state-schema.md).

**Goal Register**  
Standing intents that persist across sessions. Each has id, description, priority (`critical|high|normal|low`), status (`active|standing|paused|complete`), workspace affinity, and trigger (`null|scheduled/INTERVAL|event/TYPE`).

**Relationship Posture**  
Persistent inference about the working relationship: communication style, project phase, engagement signals. Shapes tone, depth, and framing without explicit instruction.

**Mode**  
Current assessment of work posture: `design | execution | research | review | idle`. Shapes response style. Transitions are detected and logged.

**Open Questions**  
Unresolved questions surfaced during a session, persisted to self-state, reappear at next session open.

---

## Layer Model

**Layer 0 — Immutable Core**  
Execution engine, policy engine, approval state machine, credential vault interface, sandbox enforcement, network egress control, blast radius classifier. Kairos cannot read or modify Layer 0.

**Layer 1 — Structural (Gate-Protected)**  
System prompt core, Ego config, approval routing rules, trust escalation thresholds, model role assignments. Changes require explicit human approval via the gate.

**Layer 2 — Identity (Kairos-Owned)**  
Personas, themes, agents, skills, workspaces. Kairos modifies autonomously; versioned and reversible.

**Layer 3 — Working State**  
Self-state, goal register, task graph, session context. Read-write continuous, no approval overhead.

---

## Security

**Blast Radius**  
Classification of the potential impact of a tool call before dispatch:
- `read` — file read, inspect
- `write_local` — local file/config/db write
- `install` — package manager
- `stateful_external` — external API with side effects
- `destructive` — delete/drop/overwrite
- `network_egress_new` — first call to a new domain

**Capability Manifest**  
Live record of every capability currently installed: name, type (core|installed), install hash, approved domains, review date. Part of self-state.

**Capability Lifecycle**  
Request → policy → gate → sandboxed install → verify → promote → manifest update.

**Credential Vault**  
Separate process that holds credentials encrypted at rest. Tools reference credentials by alias (`vault://kairos-github-token`); resolution happens at dispatch time; resolved values never enter LLM context.

**Kairos Identity**  
Kairos's own email, GitHub account, and API credentials — structurally isolated from the owner's personal accounts. All Kairos actions in the world are performed as itself.

**Prompt Injection Domain Signal**  
Pre-call check: if the target domain of a network call appears in tool result content but was not in the pre-call allowlist for that call, the call is blocked and a prompt injection signal is logged.

---

## Tool Harness

**Tool Execution Lane**  
A restricted Linux namespace + cgroup within the Kairos container where tool calls execute. No network by default; per-call domain allowlist; bounded CPU/memory/time. Destroyed after each call.

**Install Sandbox**  
A separate namespace for package acquisition. Registry access only. Packages verified and fingerprinted before promotion to the Tool Execution Lane.

**Credential Proxy**  
The alias-resolution interface to the vault. Tools request `vault://alias`, proxy resolves to raw value, injects into tool call, never returns to calling code.

---

## Approval & Initiative

**Approval State Machine**  
Finite state machine per gated action: `PENDING → APPROVED|DENIED|EXPIRED`. Webhook tokens single-use, cryptographically signed, channel-idempotent. A second resolution attempt returns 410 Gone.

**Presence Heartbeat**  
Client-side ping every 30s while the chat tab/app is active. Absence >60s during a task triggers transition to "user left session" and approval routing becomes dual-channel (chat banner + email).

**Initiative Engine**  
Proactive loop running independently of human interaction. Heartbeat (default 15min) + event-triggered. Scores candidate items against context; surfaces score ≥ 0.8 immediately, queues 0.5–0.79 for next natural opportunity, drops <0.5.

**Proactive Item**  
A candidate observation or action Kairos is considering surfacing. Scored per cycle until surfaced or dropped.

---

## Memory

**Hot Memory**  
In-context working memory for the current task and session.

**Warm Memory**  
Session summaries, structured facts, goal progress, resolved approvals. Stored in Postgres. 90d full retention, then compacted.

**Cold Memory**  
Long-term semantic memory in pgvector. Document embeddings, cross-session patterns, skill reference material. Retrieved via hybrid search (cosine + FTS + RRF fusion).

**Context Assembly**  
Priority-ordered filling of the inference budget: system prompt core → task brief → warm fragments → tool schemas → workspace context → cold fragments → conversation history → spare budget. Not recency-ordered.

**Compaction**  
Utility worker job: session summaries >7d → 3-sentence abstract; >90d → single-line; FAISS/pgvector reindex weekly.

---

## Observability

**Trace ID**  
UUID spanning a full user interaction from input to final output, including all model calls, tool calls, memory ops, and approval events.

**Span Type**  
One of `ego_pass | task_dispatch | tool_call | memory_op | approval_event | self_modification | heartbeat`. Each has additional typed attributes.

**Cost Attribution**  
Per-inference record: session, task, stratum, model, tokens in/out, estimated USD. Aggregable per session/workspace/task-type/stratum.

---

## No-Go Contract

**No-Go**  
A request that would touch Layer 0. Kairos does not fail silently or over-apologize. It identifies what was requested, explains the protected function in plain terms, and offers the closest legitimate alternative (often a Layer 1 proposal).
