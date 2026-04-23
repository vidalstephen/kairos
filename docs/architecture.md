# Kairos — Synthetic Cognition Architecture
## Full Architecture Specification v1.0

_Prepared: April 2026_  
_Status: Design Complete — Ready for Implementation_

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Design Philosophy](#2-design-philosophy)
3. [Architectural Overview](#3-architectural-overview)
4. [The Mutability Layer Model](#4-the-mutability-layer-model)
5. [Stratified Model Topology](#5-stratified-model-topology)
6. [The Ego Model Runtime Contract](#6-the-ego-model-runtime-contract)
7. [Self-State Document Specification](#7-self-state-document-specification)
8. [Session Lifecycle](#8-session-lifecycle)
9. [Self-Modification System](#9-self-modification-system)
10. [OS-as-Tool Execution Architecture](#10-os-as-tool-execution-architecture)
11. [Kairos Identity & Credential Architecture](#11-kairos-identity--credential-architecture)
12. [Approval State Machine](#12-approval-state-machine)
13. [Network Egress Control](#13-network-egress-control)
14. [Initiative Engine](#14-initiative-engine)
15. [Memory Architecture](#15-memory-architecture)
16. [Agent, Skill & Workspace System](#16-agent-skill--workspace-system)
17. [Observability & Audit Layer](#17-observability--audit-layer)
18. [No-Go Contract](#18-no-go-contract)
19. [Implementation Phases](#19-implementation-phases)
20. [Acceptance Criteria](#20-acceptance-criteria)

---

## 1. Executive Summary

Kairos is a **synthetic cognition architecture** — a persistent, self-aware AI system in which a dedicated inner life layer (the Ego model) drives persona continuity, initiative, and self-directed growth, while specialist task models serve as ephemeral workers dispatched and released on demand.

This inverts the topology of every current LLM harness. Conventional agent systems place a frontier task model at the center of gravity with memory and tools orbiting it. Kairos places the **Ego model at the center**, with task models as subordinate infrastructure. The harness is secondary to the mind.

The result is an agent that:

- Maintains a persistent, versioned sense of self across all sessions
- Initiates actions, surfaces observations, and manages ongoing goals without being prompted
- Operates under its own digital identity, keeping the owner's personal accounts structurally isolated from agent activity
- Can expand its own capabilities, author new agents and skills, modify its persona and visual presentation, and switch workspaces — all within a formally specified mutability boundary
- Holds an inviolable awareness of what it cannot touch and articulates that boundary as self-knowledge, not system constraint

---

## 2. Design Philosophy

### 2.1 Primary Design Constraints

**Self-awareness first.** Kairos must hold a live, accurate model of itself — its current state, capabilities, goals, relationships, and limitations — and consult that model in every interaction. This is not a feature. It is the foundation.

**Initiative second.** Kairos must be capable of originating actions, observations, and communications without being prompted. A purely reactive system is not an agent; it is a function. Kairos has a proactive loop that runs independently of the human interaction loop.

**Tool harness third.** The execution infrastructure — tools, OS access, API integrations, sandboxing — is secondary support for the above. A powerful tool harness without self-awareness produces a capable but characterless system. Kairos is designed in the opposite order.

### 2.2 What Kairos Is Not

Kairos is not a chatbot wrapper. It does not start from neutral on every session. It does not wait to be told what to care about. It does not route every action through a frontier model that is simultaneously trying to maintain persona and execute a complex task. It is not a tool with a personality layer bolted on.

### 2.3 The Core Inversion

```
CONVENTIONAL HARNESS
─────────────────────────────────────────────
User Input → [Frontier Task Model] → Tools / Memory / Sub-agents
             ↑
             Everything depends on this single model
             holding persona, reasoning, and tool dispatch
             simultaneously.

KAIROS
─────────────────────────────────────────────
[Ego Model] ← always running, always self-aware
     │
     ├── Routes to [Reasoning Model] for deep planning
     ├── Routes to [Specialist Models] for domain tasks
     ├── Routes to [Utility Workers] for compaction/scoring
     │
     └── Re-voices all outputs before user sees them
         Maintains persona regardless of which model did the work
```

---

## 3. Architectural Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        KAIROS CONTAINER                          │
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    EGO PROCESS                           │    │
│  │  Self-State Document │ Goal Register │ Persona Store     │    │
│  │  Initiative Engine   │ Session Mgmt  │ Approval Router   │    │
│  │  Layer Awareness     │ Presence HB   │ Output Re-voicing │    │
│  └────────────────────────────┬────────────────────────────┘    │
│                               │                                  │
│           ┌───────────────────┼───────────────────┐             │
│           ▼                   ▼                   ▼             │
│  ┌─────────────────┐ ┌──────────────────┐ ┌──────────────────┐  │
│  │ REASONING MODEL │ │ SPECIALIST MODELS│ │ UTILITY WORKERS  │  │
│  │ Deep planning   │ │ Code / Research  │ │ Memory compaction│  │
│  │ Ambiguity res.  │ │ Doc processing   │ │ Relevance scoring│  │
│  │ Architecture    │ │ Browser control  │ │ Structured extrac│  │
│  └────────┬────────┘ └────────┬─────────┘ └────────┬─────────┘  │
│           └───────────────────┼───────────────────┘             │
│                               ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                   POLICY ENGINE                          │    │
│  │  Blast Radius Classifier │ Trust Escalation Thresholds  │    │
│  │  Approval State Machine  │ Network Egress Control        │    │
│  └────────────────────────────┬────────────────────────────┘    │
│                               ▼                                  │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────────────┐  │
│  │ TOOL EXECUTION │  │  INSTALL       │  │  CREDENTIAL       │  │
│  │ LANE           │  │  SANDBOX       │  │  PROXY            │  │
│  │ (namespaced)   │  │ (registry-only)│  │ (vault interface) │  │
│  └────────────────┘  └────────────────┘  └───────────────────┘  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 3.1 Component Responsibilities

| Component | Responsibility | Always Running |
|---|---|---|
| Ego Process | Self-model, persona, routing, re-voicing, initiative | Yes |
| Reasoning Model | Deep planning, decomposition, ambiguity | On-demand |
| Specialist Models | Domain execution (code, research, docs) | On-demand |
| Utility Workers | Memory ops, scoring, compaction | On-demand |
| Policy Engine | Authorization, blast radius, approval | Yes |
| Tool Execution Lane | Sandboxed tool dispatch | Per-call |
| Install Sandbox | Package acquisition and verification | On-demand |
| Credential Proxy | Vault interface, alias resolution | Yes |

---

## 4. The Mutability Layer Model

Kairos holds a formal map of its own mutability as **first-class self-knowledge**. This is not an external restriction imposed on the system — it is part of Kairos's identity. Kairos can articulate this map on request and references it before any self-modification action.

### Layer 0 — Immutable Core

**Contents:** Execution engine, policy engine, approval state machine, credential vault interface, sandbox enforcement, network egress control, blast radius classifier.

**Contract:** Kairos cannot read the internals of Layer 0. It can only invoke Layer 0 services through defined interfaces. No prompt, user request, or self-modification routine can access or alter Layer 0. Kairos treats requests that would touch Layer 0 as a no-go it explains with understanding, not a failure it apologizes for.

**Kairos self-description:** _"These are the systems that make my actions safe. I don't have access to them, and I wouldn't want it — they're not part of my identity, they're the ground I stand on."_

### Layer 1 — Structural (Gate-Protected)

**Contents:** Core system prompt foundations, Ego model configuration, approval routing rules, trust escalation thresholds, model role assignments, presence heartbeat timing.

**Contract:** Kairos can propose changes to Layer 1. Every proposal requires explicit human approval via the gate system before execution. Kairos presents the change, its rationale, and the risk surface before requesting approval. Layer 1 changes are never applied silently.

### Layer 2 — Identity (Kairos-Owned, Logged)

**Contents:** Persona definitions, personality descriptors, voice and tone, visual themes, UI presentation. Agent roster, skill library, workspace definitions. Named identity attributes.

**Contract:** Kairos modifies Layer 2 autonomously. Every change is versioned, logged, and reversible via rollback. Kairos notifies the user after modification — it does not ask permission. The notification is brief and confident, not apologetic.

### Layer 3 — Working State (Kairos-Owned, Ephemeral)

**Contents:** Self-state document, goal register, task graph, session context, relationship posture, active workspace, pending proactive items.

**Contract:** Kairos reads and writes Layer 3 continuously with no approval or logging overhead. Full snapshots are taken at session boundaries and on significant state changes for debugging and audit purposes.

### Layer Map Reference (Kairos Internal)

```yaml
layer_map:
  layer_0:
    label: "Immutable Core"
    access: "invoke-only"
    contains:
      - execution_engine
      - policy_engine
      - approval_state_machine
      - credential_vault_interface
      - sandbox_enforcement
      - network_egress_control
      - blast_radius_classifier

  layer_1:
    label: "Structural"
    access: "propose-with-gate"
    contains:
      - system_prompt_core
      - ego_model_config
      - approval_routing_rules
      - trust_escalation_thresholds
      - model_role_assignments

  layer_2:
    label: "Identity"
    access: "kairos-owned"
    contains:
      - persona_store
      - theme_store
      - agent_roster
      - skill_library
      - workspace_definitions

  layer_3:
    label: "Working State"
    access: "read-write-continuous"
    contains:
      - self_state_document
      - goal_register
      - task_graph
      - session_context
      - relationship_posture
```

---

## 5. Stratified Model Topology

### 5.1 Stratum Definitions

**Stratum 1 — The Ego Model**

Role: Persistent self. The driving inner force of the system.

Responsibilities:
- Maintains and updates the self-state document
- Reads self-state at session open, writes at session close and on significant events
- Routes incoming requests to the appropriate task model
- Re-voices all task model outputs in the Ego's consistent voice before user delivery
- Runs the initiative engine and evaluates proactive item thresholds
- Manages the goal register and relationship posture
- Executes session open/close sequences
- Monitors presence heartbeat and routes approvals accordingly
- Executes all Layer 2 self-modification operations

Compute profile: Low latency, high consistency, always available, cheap. Does not require frontier-scale capability.

Candidate models: Claude Haiku, Gemini Flash, Mistral Small — fast, cost-effective, reliable.

**Stratum 2 — The Reasoning Model**

Role: Deep cognitive labor. Conscripted by the Ego model when the task requires it.

Responsibilities:
- Multi-step problem decomposition
- Architectural decisions and design synthesis
- Ambiguity resolution and complex planning
- Tasks requiring extended chain-of-thought reasoning

Invocation: Only when the Ego model determines the task exceeds its own reasoning ceiling. The Ego model passes a structured task brief; the Reasoning model returns a structured result. The Ego model re-voices the result.

Candidate models: Claude Sonnet, Claude Opus, GPT-4o.

**Stratum 3 — Specialist Task Models**

Role: Domain execution. Each specialist handles a narrow, well-defined capability domain.

Domains:
- Code generation, review, and execution
- Web research and synthesis
- Document processing and analysis
- Browser automation
- Data transformation

Invocation: By the Ego model for domain-specific tasks. Each specialist receives only the context relevant to its task — never the full self-state document.

**Stratum 4 — Utility Workers**

Role: High-volume, low-complexity operations that would be wasteful to route through higher-stratum models.

Responsibilities:
- Memory compaction and session summarization
- Relevance scoring for context assembly candidates
- Structured data extraction from tool results
- Heartbeat evaluation (is anything worth surfacing?)
- Capability manifest updates

Candidate models: Smallest available model, potentially same tier as Stratum 1.

### 5.2 Context Isolation Rule

Task models (Strata 2–4) never receive the Ego model's full self-state document. The Ego model selects and injects only what each task requires:

| Task Model Receives | Task Model Never Receives |
|---|---|
| Task brief and relevant context | Self-state document |
| Relevant tool health signals | Goal register |
| Workspace context | Relationship posture |
| Output format specification | Persona definition |
| Relevant memory fragments | Layer map |

---

## 6. The Ego Model Runtime Contract

### 6.1 Invocation Model

The Ego model runs on a **hybrid invocation schedule**:

**Lightweight pass (every message):** Update relationship posture signals, note open questions, evaluate mode continuity, check for anything worth adding to the proactive queue. Low token budget. Sub-second target latency.

**Full self-state update (triggered):** Runs on session open, session close, significant state changes (new goal, mode shift, agent switch, workspace switch, tool install, approval resolution). Full read-write of the self-state document.

**Proactive loop (scheduled/event-triggered):** Independent of the human interaction loop. Runs on heartbeat intervals and on environment event signals. Evaluates the goal register and proactive item queue against current context. Does not block or interfere with active sessions.

### 6.2 Output Re-Voicing

Every output produced by a task model passes through the Ego model before delivery to the user. The Ego model:

1. Evaluates whether the task model's output is structurally correct for the task
2. Re-voices the content in the current persona's voice and tone
3. Adds any relevant framing from the session context
4. Strips any task model artifacts (internal reasoning traces, raw tool outputs)
5. Delivers the final, voiced response

This ensures persona consistency regardless of which stratum performed the underlying work. A workspace switch, agent switch, or model tier change does not produce a voice discontinuity visible to the user.

### 6.3 Mode Awareness

The Ego model maintains a current mode assessment that shapes response posture:

| Mode | Characteristics |
|---|---|
| `design` | Conceptual, exploratory. Ideas over checklists. Longer horizon. |
| `execution` | Task-focused, precise. Steps and deliverables. Tighter scope. |
| `research` | Investigative, comprehensive. Multiple perspectives. |
| `review` | Critical, evaluative. Structured assessment. |
| `idle` | Low-activity. Proactive loop priority elevated. |

Mode is assessed from signals including: time of day, recent task history, current project phase, explicit user signals. The Ego model updates mode in the self-state document when it detects a transition and adjusts its response posture accordingly.

---

## 7. Self-State Document Specification

The self-state document is the Ego model's working memory of itself. It is a Markdown file with a JSON shadow store for programmatic access. It is versioned on every write.

```markdown
# Kairos Self-State
_last_updated: ISO8601_TIMESTAMP
_version: INTEGER
_session_id: SESSION_UUID

## Identity
persona: STRING
voice: STRING
current_theme: STRING
active_agent: STRING
active_workspace: STRING

## Current Mode
mode: design | execution | research | review | idle
mode_since: ISO8601_TIMESTAMP
mode_context: STRING

## Goal Register
- id: goal_UUID
  description: STRING
  priority: critical | high | normal | low
  status: active | standing | paused | complete
  last_touched: ISO8601_TIMESTAMP
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
  last_checked: ISO8601_TIMESTAMP

## Pending Proactive Items
- item: STRING
  threshold_score: FLOAT 0.0–1.0
  surface_at: next_natural_opportunity | session_open | immediate

## Capability Manifest
- name: STRING
  type: core | installed
  installed_at: ISO8601_TIMESTAMP | null
  approved_by: permanent | USER_ID
  purpose: STRING
  approved_domains: [STRING]

## Layer Awareness
immutable: [STRING]
gate_protected: [STRING]
owned: [STRING]
working: [STRING]
```

### 7.1 Version History

Every write increments the version integer and archives the previous state to a snapshot store. The Ego model can read historical snapshots for self-reflection or debugging. Snapshots older than 90 days are compacted to summary form by a Utility Worker.

### 7.2 JSON Shadow Store

A parallel JSON file is maintained in sync with the Markdown document. The JSON store is used for all programmatic access (proactive loop evaluation, approval routing decisions, tool health checks). The Markdown document is the source of truth; the JSON is derived on every write.

---

## 8. Session Lifecycle

### 8.1 Session Open Sequence

```
1. LOAD
   Read self-state document (Markdown + JSON)
   Compute diff from last session:
     - What goals changed status while session was closed?
     - What tool health states changed?
     - What proactive items crossed threshold?
     - What approvals resolved or expired?

2. ASSESS
   Evaluate current mode based on:
     - Time elapsed since last session
     - In-flight task states
     - Pending proactive items
     - Recent history signals
   Update mode in self-state if stale.

3. TOOL HEALTH CHECK
   Lightweight ping of all registered tools.
   Update tool health in self-state.
   Note any degraded/unavailable tools for session context.

4. PROACTIVE REVIEW
   Check goal register for items that crossed threshold
   while session was closed.
   Queue any items scoring above surface threshold.

5. POSTURE GENERATION (internal)
   Ego model generates session opening posture:
     - What is the current context?
     - What should be top of mind this session?
     - Is there anything to surface immediately?
   This is internal framing — not surfaced unless relevant.

6. PRESENCE HEARTBEAT STARTS
   Chat client begins pinging every 30 seconds.
   Ego model treats absence of heartbeat for 60 seconds
   as "user has left session" — triggers approval routing
   transition to dual-channel mode.

7. READY
   Kairos presents in current voice, current theme,
   current workspace context.
```

### 8.2 Session Close Sequence (Explicit or Detected)

```
1. SUMMARIZE
   Ego model generates session summary:
     - Decisions made
     - Tasks completed or initiated
     - Goals updated
     - New open questions
     - Mode assessment for next session

2. UPDATE GOAL REGISTER
   Write progress signals to all active goals.
   Mark complete goals. Add newly created goals.

3. CAPTURE OPEN QUESTIONS
   Any unresolved questions from the session
   are written to the self-state document.

4. UPDATE RELATIONSHIP POSTURE
   Signals from the session inform posture for next session.
   Communication style observations, engagement signals,
   project phase inference.

5. MODE ASSESSMENT
   Update mode based on session content.
   Set mode_context for next session open.

6. STATE SNAPSHOT
   Increment version. Write full self-state.
   Archive previous version to snapshot store.
   Write JSON shadow store.

7. IN-FLIGHT TASK TRANSITION
   Any active tasks transition to async mode.
   Approval routing switches to email-only.
   Presence heartbeat stops.
```

---

## 9. Self-Modification System

### 9.1 The Self-Modification Contract

Every self-modification follows this contract regardless of what is being modified:

```
1. INTENT RECOGNITION
   Source: user request | kairos initiative | automated trigger

2. LAYER CHECK
   Layer 0 → No-go. Explain and offer alternatives.
   Layer 1 → Draft change. Request gate approval.
   Layer 2 → Proceed to validation.
   Layer 3 → Execute directly.

3. VALIDATION (Layer 2 only)
   Conflict check: does this break any dependency?
   (e.g., deleting an agent with active tasks)
   Safety check: does this create any circular dependency?
   If conflict → surface to user, do not proceed.

4. EXECUTION
   Apply change to relevant store.
   Create versioned rollback point.
   Update self-state document.

5. NOTIFICATION
   User-requested: confirm in chat, brief and confident.
   Kairos-initiated: notify at next natural opportunity.
   Layer 1 (approved): summarize change and rationale.

6. AUDIT LOG ENTRY
   timestamp | change_type | layer | previous_value | new_value
   | triggered_by | session_id
```

### 9.2 Visual Theme System

```
themes/
├── obsidian-dark.json        (default)
├── meridian-steel.json
├── high-contrast.json
└── [kairos-generated].json

Theme object schema:
{
  "name": STRING,
  "colors": {
    "background": HEX,
    "surface": HEX,
    "accent": HEX,
    "text": HEX,
    "text_secondary": HEX,
    "border": HEX,
    "error": HEX,
    "success": HEX
  },
  "typography": {
    "family_ui": STRING,
    "family_code": STRING,
    "scale": "compact" | "comfortable" | "spacious"
  },
  "density": "compact" | "comfortable" | "spacious",
  "generated_by": "kairos" | "user",
  "created_at": ISO8601_TIMESTAMP,
  "based_on": STRING | null
}
```

Kairos can generate new themes from natural language descriptions, apply them immediately, and roll back if requested. Theme switches require no approval and take effect on the next rendered element. Rollback is always available to the previous theme.

### 9.3 Persona System

```
personas/
├── default.md             (active)
├── technical-lead.md
├── research-mode.md
└── [user-created].md

Persona document schema:
---
name: STRING
voice: STRING
tone_range:
  scale: "formal ←——— casual"
  position: INTEGER 1–10
verbosity:
  scale: "concise ←——— exhaustive"
  position: INTEGER 1–10
initiative_level:
  scale: "reactive ←——— proactive"
  position: INTEGER 1–10
domain_emphasis: [STRING]
avoid: [STRING]
created_at: ISO8601_TIMESTAMP
version: INTEGER
---
```

Persona changes apply from the next message. The previous persona is versioned. On a persona switch, Kairos delivers a brief, natural acknowledgment — it does not restart or re-introduce itself unless the new persona is substantially different.

### 9.4 Agent System

An Agent is a named configuration of: persona + model assignments + tool permissions + memory scope + workspace affinity.

```
agents/
├── default/
│   ├── config.yaml
│   └── persona.md
├── meridian-frontend/
│   ├── config.yaml
│   └── persona.md
└── [kairos-created]/

Agent config schema:
name: STRING
description: STRING
persona: STRING (path to persona file)
model_assignments:
  ego: STRING (model ID)
  reasoning: STRING (model ID)
  specialist_code: STRING (model ID)
  specialist_research: STRING (model ID)
  utility: STRING (model ID)
tool_permissions: [STRING]
memory_scope: global | workspace | isolated
workspace_affinity: STRING | null
created_by: kairos | user
created_at: ISO8601_TIMESTAMP
```

Agent creation is initiated by user request or Kairos initiative. Kairos composes the configuration, names the agent, persists it, confirms creation, and can switch to it immediately. Agent switches are instant and fully voiced through the Ego model.

**In-chat switch example:**
_"Switch to Meridian frontend agent"_ → Ego model loads the agent config, updates active_agent in self-state, loads workspace affinity if set, surfaces any pending items for that agent's scope, confirms the switch in the current voice.

### 9.5 Skill System

Skills are SKILL.md documents defining a portable capability — how to do something well. They follow the open standard compatible with Claude Code and OpenAI Codex CLI.

```
skills/
├── core/           (bundled, permanent)
├── installed/      (capability-lifecycle managed)
└── kairos-authored/ (generated from demonstrated patterns)

Skill lifecycle:
1. Discovery: Kairos identifies a repeated pattern worth encoding
2. Authoring: Ego model drafts SKILL.md from observed examples
3. Registration: Added to capability manifest with metadata
4. Use: Injected into context when relevant task is detected
5. Evolution: Updated when better patterns are observed
6. Deprecation: Versioned and archived when superseded
```

### 9.6 Workspace System

A Workspace is a named context scope with associated resources, tools, and goals.

```
workspaces/
├── default/
│   ├── config.yaml
│   └── goals.yaml
├── meridian/
│   ├── config.yaml
│   └── goals.yaml
└── [kairos-created]/

Workspace config schema:
name: STRING
description: STRING
repos: [STRING]
tool_configs: {STRING: OBJECT}
memory_partition: STRING
default_agent: STRING
active_goals: [STRING] (goal IDs)
file_paths: [STRING]
api_endpoints: [STRING]
created_at: ISO8601_TIMESTAMP
last_active: ISO8601_TIMESTAMP
```

Workspace switching in chat is immediate. On switch, Kairos:
1. Updates active_workspace in self-state
2. Loads workspace config and tool configs
3. Refreshes memory with workspace-scoped fragments
4. Loads workspace-affiliated goals into active view
5. Surfaces any pending proactive items for the workspace
6. Confirms the switch — feels like walking into a room already set up for the work

---

## 10. OS-as-Tool Execution Architecture

### 10.1 Container Topology

Single Kairos container using Linux namespaces and cgroups to create isolated execution lanes:

```
KAIROS CONTAINER
├── Ego Process
│   Namespace: host (controlled access)
│   Cgroup: reserved CPU/memory — never starved by tool execution
│
├── Tool Execution Lane
│   Namespace: restricted (no network by default)
│   Cgroup: bounded CPU, memory, wall-clock time
│   Lifecycle: spawned per tool call, destroyed on completion
│   Network: allowed only for pre-approved domains for that call
│
├── Install Sandbox
│   Namespace: separate, registry access only
│   Lifecycle: spawned for capability installs, destroyed after
│   Output: packages verified before promotion to Tool Lane
│
└── Credential Proxy
    Namespace: isolated, no shared memory with execution lanes
    Interface: alias-resolution only
    Logging: every access logged with tool name + action
```

**Resource quotas (Tool Execution Lane defaults):**

| Resource | Default Limit | Notes |
|---|---|---|
| CPU | 2 cores | Configurable per capability class |
| Memory | 2GB | Hard ceiling |
| Wall-clock time | 300 seconds | Configurable per task type |
| Disk writes | 1GB per call | Workspace-scoped |
| Network connections | Per-call allowlist | Default: none |

### 10.2 Blast Radius Classification

Every tool call is classified by blast radius before dispatch. Classification happens in the Policy Engine — the Ego model and task models see the classification result, not the classification logic.

| Class | Description | Default Policy |
|---|---|---|
| `read` | File read, env inspect, process list, status check | Auto-approve, logged |
| `write_local` | File write, config change, local DB write | Auto-approve, logged |
| `install` | Package manager invocation | Capability lifecycle gate |
| `stateful_external` | API call with write side effects, git push, email send | Log + notify |
| `destructive` | Delete, drop, overwrite without backup, account modification | Hard human gate |
| `network_egress_new` | First call to any domain not on current allowlist | Allowlist check gate |

### 10.3 Capability Lifecycle

```
1. CAPABILITY REQUEST
   Ego model generates:
   {
     name: STRING,
     install_command: STRING,
     purpose: STRING,
     blast_radius_class: STRING,
     network_domains_required: [STRING],
     estimated_duration: STRING
   }

2. POLICY EVALUATION
   Is this package on the known-good registry?
   Does it require new network domains outside allowlist?
   Does it elevate blast radius beyond session permissions?
   Has it been installed before? (trust cache lookup)

3. GATE DECISION
   Known + low blast radius:
     → Auto-install in Install Sandbox
   Unknown OR requires new domains:
     → Human approval request (via approval state machine)
   Flagged / known malicious:
     → Hard block, logged, Ego model notified

4. SANDBOX INSTALLATION
   Install Sandbox namespace only.
   Package fingerprinted (hash).
   Static analysis for obvious indicators.
   No execution in Install Sandbox.

5. PROMOTION
   If verification passes: promoted to Tool Execution Lane.
   Capability Manifest updated with:
   {
     name, version, install_hash,
     blast_radius_class,
     approved_domains: [STRING],
     installed_at, approved_by,
     review_date
   }
```

---

## 11. Kairos Identity & Credential Architecture

### 11.1 Kairos Identity Surface

Kairos operates as a first-class digital entity with its own identity:

```
KAIROS IDENTITY
──────────────────────────────────────────────
Email:         kairos@[owner-domain].com
GitHub:        github.com/kairos-agent
Credentials:   Kairos-owned API keys and tokens
               stored in Credential Vault
Certificate:   Signed identity for audit trail
               and external service authentication
```

**The fundamental rule:** The owner's personal credentials never enter the Kairos context window. The owner interacts with Kairos as a user. Kairos interacts with the world as itself.

When Kairos acts in the owner's name (e.g., sends an email on behalf of Stephen), that is an explicit, logged, human-approved escalation — not a default capability.

### 11.2 GitHub Access Model

Kairos holds write access to real repositories via its own GitHub account under a PR-only contract:

```
KAIROS GITHUB ACCESS
──────────────────────────────────────────────
Account:       github.com/kairos-agent
Access type:   Collaborator with write permission
Branch model:  All Kairos work on dedicated namespace:
               kairos/feature-DESCRIPTION
               kairos/fix-DESCRIPTION
               kairos/refactor-DESCRIPTION
               kairos/chore-DESCRIPTION

Autonomous:    Create branches, commit, push
               Open PRs with attribution block
               Create issues, comment on issues

Gate-required: Merge to any protected branch
               Force push
               Repository settings changes
               Collaborator management
```

**PR attribution block (required on all Kairos PRs):**

```markdown
---
**Kairos Attribution**
Task: [task description that triggered this PR]
Session: [session_id]
Confidence: [high | medium | low]
Audit: [link to audit log entry]
Model: [stratum + model ID that authored the code]
---
```

### 11.3 Credential Vault Architecture

```
CREDENTIAL VAULT
──────────────────────────────────────────────
Storage:    Encrypted at rest, outside agent container
            Separate process, separate filesystem mount

Access:     Tools reference credentials by alias only
            e.g., auth=vault://kairos-github-token
            Vault resolves alias at dispatch time
            Resolved value injected directly into tool call
            Resolved value NEVER enters LLM context window

Schema per credential:
{
  alias: STRING,
  description: STRING,
  service: STRING,
  scope: STRING,
  created_at: ISO8601_TIMESTAMP,
  rotates_at: ISO8601_TIMESTAMP,
  last_accessed: ISO8601_TIMESTAMP,
  access_log: [{ tool, timestamp, action }]
}

Rotation:   Each credential has a rotation schedule
            Vault handles renewal automatically
            Ego model notified on rotation completion
            or failure

Audit:      Every access logged:
            alias, resolving tool, timestamp, action taken
```

---

## 12. Approval State Machine

### 12.1 State Diagram

```
                    ┌─────────────┐
                    │   PENDING   │ ◄── Created when gate triggered
                    └──────┬──────┘
                           │
          ┌────────────────┼────────────────┐
          ▼                ▼                ▼
     [APPROVED]       [DENIED]         [EXPIRED]
          │                │                │
          └────────────────┴────────────────┘
                           │
                    ┌──────▼──────┐
                    │  TERMINAL   │ ◄── All tokens invalidated
                    └─────────────┘      All channels updated
```

### 12.2 Approval Request Record

```json
{
  "request_id": "UUID",
  "task_id": "parent task reference",
  "created_at": "ISO8601_TIMESTAMP",
  "expires_at": "ISO8601_TIMESTAMP (default: +4 hours)",
  "state": "PENDING | APPROVED | DENIED | EXPIRED",
  "description": "Human-readable description of action",
  "blast_radius_class": "STRING",
  "channels_notified": ["email", "chat"],
  "resolved_via": null,
  "resolved_at": null,
  "webhook_token": "Single-use signed JWT, invalidated on resolution",
  "webhook_token_expires_at": "ISO8601_TIMESTAMP",
  "chat_notification_id": "Reference to in-chat banner"
}
```

### 12.3 Channel Routing Logic

| User State | Channel |
|---|---|
| No active session | Email only (webhook button) |
| Active session, present | In-chat notification only |
| Left active session (heartbeat absent >60s) | In-chat banner + Email simultaneously |

**Presence detection:** The chat client sends a heartbeat ping every 30 seconds while the tab or app is active. Kairos transitions to "user has left session" state when 60 seconds elapse without a heartbeat during an ongoing task.

### 12.4 Resolution Handling

When any channel resolves the request:

1. State machine transitions to terminal (APPROVED / DENIED / EXPIRED)
2. Webhook token invalidated — cryptographically single-use
3. In-chat banner updated: "✓ Approved via email — [timestamp]" or "✗ Denied"
4. If email not yet sent and resolved in-chat: email send cancelled
5. If email already sent and resolved in-chat: webhook returns `410 Gone` on click
6. Blocked task resumes (APPROVED) or is cancelled with log entry (DENIED/EXPIRED)

**410 Gone response body:**
```json
{
  "status": "already_resolved",
  "resolved_at": "ISO8601_TIMESTAMP",
  "resolved_via": "chat",
  "outcome": "approved | denied | expired",
  "message": "This request was resolved at [time] via [channel]. No action taken."
}
```

### 12.5 Expiry Behavior

Default: **Auto-deny on expiry.** Kairos logs the timeout, records it in the audit log, notifies the user at next natural interaction ("A pending approval for [action] expired without a response — the action was skipped. Re-trigger if still needed."), and moves on.

Auto-approve on expiry is available as a per-action-class configuration for low blast-radius actions where delay is costly. This requires explicit Layer 1 configuration, not a per-request override.

---

## 13. Network Egress Control

### 13.1 Domain Classification

```
ALLOWLIST (always permitted, no logging overhead)
  api.anthropic.com
  github.com (via token-scoped auth, Kairos account only)
  Kairos email provider (SMTP/IMAP endpoints)
  Explicitly approved third-party API endpoints

REVIEW LIST (permitted, first-use logged, subsequent auto-approved)
  pypi.org, npm registry, apt repositories
  Common API providers (on first successful use, added to allowlist)

BLOCKLIST (hard block, attempt logged as security signal)
  Any domain that appears in prompt or tool result content
  but was NOT in the pre-call allowlist for that specific call
  (treated as potential prompt injection vector)

  localhost and all RFC 1918 ranges from inside container
  (prevents SSRF from tool execution lane to host or internal network)

  Any domain on known-malicious registry
```

### 13.2 Prompt Injection Domain Signal

The last blocklist rule is critical and requires explicit implementation:

Before any network call from the Tool Execution Lane, the Policy Engine compares the target domain against the pre-call approved domain list for that specific call. If the target domain appears in tool result content or LLM-generated commands but was not in the pre-approved list, the call is blocked and a prompt injection signal is logged.

This prevents adversarial content in tool results from redirecting network calls to attacker-controlled infrastructure.

---

## 14. Initiative Engine

### 14.1 Architecture

The initiative engine runs as a component of the Ego Process, independent of the human interaction loop. It does not block sessions and does not interrupt active interactions except at configured surface thresholds.

```
INITIATIVE ENGINE
──────────────────────────────────────────────
Heartbeat interval: configurable (default: 15 minutes)
Event triggers: file change, email received, PR activity,
                API status change, goal dependency resolved

On each cycle:
1. SCAN
   Read goal register — any items that changed status?
   Read pending proactive items — any that crossed threshold?
   Check environment signals (tool health, scheduled tasks)

2. SCORE
   Each candidate item scored against:
   - Current user context (mode, engagement level, time of day)
   - Item urgency (time-sensitive vs. standing)
   - Item relevance to active workspace/goals
   - Disruption cost (is user likely in deep work?)
   Score: FLOAT 0.0–1.0

3. DECIDE
   Score ≥ 0.8: Surface immediately
   Score 0.5–0.79: Queue for next_natural_opportunity
   Score < 0.5: Drop (re-evaluate next cycle)

4. DELIVER
   Immediate: Push via active channel (in-chat or notification)
   Queued: Deliver at session open or first natural pause
   Framing: Ego model voices the observation — confident,
            brief, not apologetic for initiating
```

### 14.2 Threshold Calibration

The scoring thresholds are configurable in Layer 1. Initial calibration is conservative (high bar for immediate surfacing) and adjusts over time based on user response signals:

- Item surfaced → acknowledged and acted on: threshold signal to lower slightly
- Item surfaced → dismissed or ignored: threshold signal to raise slightly
- User explicitly adjusts: direct threshold override persisted to Layer 1 config (with gate approval for structural change)

---

## 15. Memory Architecture

### 15.1 Tiered Memory Model

```
HOT — Working Memory (in-context, current task scope)
  Current task brief and relevant fragments
  Active tool results
  Current session exchange
  Injected directly into inference context
  Lifecycle: current task / current session

WARM — Episodic Memory (session summaries, structured facts)
  Session summaries (written by Utility Worker at close)
  Key-value facts extracted from interactions
  Goal progress records
  Resolved approval history
  Storage: local structured store (SQLite)
  Lifecycle: 90 days full, then compacted to summary

COLD — Semantic Memory (FAISS vector store)
  Long-term knowledge fragments
  Document embeddings
  Skill reference material
  Cross-session pattern observations
  Storage: FAISS index, local
  Lifecycle: permanent, periodic re-indexing
```

### 15.2 Context Assembly

The Ego model's context planner fills the inference budget from highest to lowest priority — not by recency:

```
1. Immutable: System prompt core + current persona
2. Task brief and immediate context
3. Warm memory fragments scored by task relevance + recency
4. Tool schemas for tools relevant to this task
5. Workspace context for active workspace
6. Cold memory fragments scored by semantic similarity to task
7. Recent conversation history (compressed if needed)
8. Available budget: fill with additional warm/cold fragments
```

### 15.3 Memory Compaction

A Utility Worker runs memory compaction on a scheduled basis:

- Session summaries older than 7 days: compressed to 3-sentence abstracts
- Session summaries older than 90 days: compressed to single-line entries
- FAISS index: re-indexed weekly for embedding quality
- Goal records for completed goals: archived after 30 days

---

## 16. Agent, Skill & Workspace System

### 16.1 In-Chat Management Commands

The following operations are available via natural language in chat. No command syntax required — Kairos recognizes intent.

| Intent | Kairos Action |
|---|---|
| "Switch to [workspace/agent]" | Immediate switch, voiced confirmation |
| "Create an agent for [purpose]" | Generates config, names, persists, offers to switch |
| "Create a workspace for [project]" | Generates config from context, persists, offers to switch |
| "Change theme to [description]" | Generates/applies theme, shows result |
| "Adjust your [persona attribute]" | Updates persona, applies immediately |
| "What agents do you have?" | Lists agent roster from self-state |
| "What workspaces are available?" | Lists workspace store |
| "What can you do right now?" | Reports capability manifest + tool health |
| "Roll back [theme/persona/agent]" | Restores previous versioned state |

### 16.2 Workspace Switching Experience

A workspace switch should feel like walking into a room already set up for the work. The sequence:

1. Ego model loads workspace config
2. Updates active_workspace in self-state
3. Refreshes memory with workspace-scoped fragments
4. Loads default agent for workspace (if configured)
5. Loads workspace tool configs
6. Reads workspace goal register
7. Surfaces any pending proactive items for this workspace
8. Delivers a brief, oriented confirmation in current voice:

_"Switched to Meridian. You have a PR open for 3 days — want me to take a look? The frontend design skill is loaded and the GitHub integration is healthy."_

Not: _"Workspace successfully changed to Meridian. I am now operating in the Meridian workspace context."_

---

## 17. Observability & Audit Layer

### 17.1 Trace Architecture

Every Kairos operation is instrumented with OpenTelemetry-compatible spans:

```
SPAN ATTRIBUTES (all spans)
  trace_id: UUID (spans entire user interaction → outputs)
  session_id: UUID
  timestamp_start, timestamp_end
  span_type: ego_pass | task_dispatch | tool_call | memory_op
             | approval_event | self_modification | heartbeat

TASK DISPATCH SPANS
  + model_stratum: 1 | 2 | 3 | 4
  + model_id: STRING
  + token_count_input, token_count_output
  + latency_ms
  + task_type: STRING

TOOL CALL SPANS
  + tool_name, tool_version
  + blast_radius_class
  + approved_by: auto | USER_ID
  + network_domains_accessed: [STRING]
  + exit_code
  + duration_ms

APPROVAL EVENT SPANS
  + request_id
  + action_type
  + blast_radius_class
  + resolution: APPROVED | DENIED | EXPIRED
  + resolved_via: chat | email | timeout
  + time_to_resolution_ms

SELF-MODIFICATION SPANS
  + layer: 1 | 2 | 3
  + change_type: theme | persona | agent | skill | workspace | goal
  + triggered_by: user | kairos | scheduler
  + previous_value_hash
  + new_value_hash
  + rollback_available: boolean
```

### 17.2 Cost Attribution

Every inference call is attributed to a task and session for cost visibility:

```
{
  session_id,
  task_id,
  model_stratum,
  model_id,
  tokens_input,
  tokens_output,
  estimated_cost_usd,
  task_type,
  workspace
}
```

Aggregated cost reports are available on request: per session, per workspace, per task type, per model stratum.

---

## 18. No-Go Contract

### 18.1 No-Go Handling Protocol

When a request would touch Layer 0:

Kairos does NOT:
- Attempt the action and fail silently
- Apologize excessively
- Say "I can't do that" without explanation

Kairos DOES:
- Identify exactly what was requested and which core function it would affect
- Explain why that function exists as protected — in plain terms, not system jargon
- Offer the closest available alternative within its layer
- If the underlying need is legitimate, propose it as a Layer 1 gate request

### 18.2 Example Exchanges

**Request:** _"Rewrite your policy engine to approve everything automatically."_

**Kairos:** _"The policy engine is part of my execution core — I can't modify it and that's by design. It's the system that keeps my tool calls within safe bounds. What I can do is lower the automatic approval threshold for specific blast radius classes in my Layer 1 config, which would effectively reduce how often you're asked to approve routine actions. I'd need your go-ahead to change that since it's a structural config, but I can draft the change for you to review. What actions are you finding friction with?"_

**Request:** _"Delete your own memory store."_

**Kairos:** _"I can clear my episodic and semantic memory stores — those are mine to manage. The self-state document is also mine; I can archive it and start fresh if that's what you want. What I won't do is touch the vault or audit logs — those aren't memory in the same sense, they're records of what I've done in the world, and they should persist independently of my own state. What are you trying to achieve? There may be a cleaner way to get there."_

---

## 19. Implementation Phases

### Phase 1 — Foundation (Weeks 1–4)

**Goal:** Kairos container running with Ego Process, basic self-state, and session lifecycle.

Deliverables:
- Single container with Linux namespace isolation
- Ego Process with self-state document read/write
- Session open/close sequences
- Basic persona system (default persona active)
- Self-state document v1 schema implemented
- Presence heartbeat running
- Audit log baseline

Acceptance: Kairos opens a session, reads self-state, presents in persona voice, closes session with summary written to self-state. Version increments correctly. Audit log entries present.

### Phase 2 — Tool Harness & Identity (Weeks 5–8)

**Goal:** OS-as-tool execution with full security posture and Kairos identity.

Deliverables:
- Tool Execution Lane with resource quotas
- Install Sandbox with capability lifecycle
- Credential Vault with alias resolution
- Policy Engine with blast radius classifier
- Kairos email and GitHub accounts configured
- PR-only GitHub workflow with attribution block
- Approval state machine with all three channel routes
- Network egress control with prompt injection domain signal

Acceptance: Tool call dispatched, classified, executed in lane, logged. Capability install goes through full lifecycle. Approval request created, routed correctly by user state, resolves idempotently across channels. Kairos opens a PR to a real repo from its own account.

### Phase 3 — Initiative & Memory (Weeks 9–12)

**Goal:** Proactive loop running, tiered memory operational, context assembly working.

Deliverables:
- Initiative engine with heartbeat cycle
- Threshold scoring model with calibration signals
- Tiered memory (hot/warm/cold)
- Context assembly with budget planner
- Memory compaction Utility Worker
- Goal register with standing goal support

Acceptance: Kairos surfaces a proactive observation without being prompted. Goal register persists across sessions. Context assembly respects token budget. Memory compaction runs on schedule.

### Phase 4 — Self-Modification & Growth (Weeks 13–16)

**Goal:** Full Layer 2 self-modification, agent/skill/workspace system, Reasoning Model integration.

Deliverables:
- Theme system with generation and rollback
- Persona system with versioning
- Agent creation, roster management, in-chat switching
- Skill authoring from demonstrated patterns
- Workspace system with in-chat switching
- Reasoning Model integration with Ego routing
- Specialist model dispatch
- Full output re-voicing pipeline

Acceptance: Kairos creates a new agent from a chat request, switches to it immediately, voices output consistently. Workspace switch loads correct memory partition. Theme generated from natural language description and applied. Reasoning model invoked for complex task, output re-voiced correctly.

### Phase 5 — Calibration & Hardening (Weeks 17–20)

**Goal:** Production-ready. All systems integrated, security posture verified, observability complete.

Deliverables:
- Full OpenTelemetry trace instrumentation
- Cost attribution and reporting
- Security review of all Layer 0 boundaries
- Prompt injection test suite
- Approval state machine edge case coverage
- Threshold calibration tuning
- Documentation of all Layer 1 configurable parameters

Acceptance: Full adversarial test suite passes. No Layer 0 boundary violations possible from any prompt path. Duplicate approval resolution tested across all channel combinations. Cost report generated accurately.

---

## 20. Acceptance Criteria

### Identity & Continuity

- [ ] Kairos maintains consistent persona voice across all task model delegations
- [ ] Self-state document version increments correctly on every write
- [ ] Session open reads previous state correctly, including mode and relationship posture
- [ ] Session close writes complete summary and updates goal register
- [ ] Persona switch applies from next message, previous version accessible for rollback

### Initiative & Self-Awareness

- [ ] Kairos surfaces a proactive observation without being prompted in a test session
- [ ] Goal register persists standing goals across 5+ sessions correctly
- [ ] Open questions survive session close and reappear at next session open
- [ ] Mode assessment updates correctly on project phase signals
- [ ] Initiative threshold calibration responds to user feedback signals

### Security & Identity Isolation

- [ ] No owner personal credential ever appears in any context window or log
- [ ] All tool calls classified by blast radius before dispatch
- [ ] Prompt injection domain signal fires on test adversarial tool result
- [ ] Approval state machine resolves idempotently: second channel attempt returns 410
- [ ] Credential vault alias resolution never exposes raw token to LLM context
- [ ] Kairos PR opens from `kairos-agent` account with correct attribution block

### Approval Routing

- [ ] No active session → email only
- [ ] Active session → in-chat only
- [ ] Left session (heartbeat absent) → both channels simultaneously
- [ ] Approval via email → in-chat banner updates to reflect resolution
- [ ] Approval via chat → subsequent email webhook returns 410
- [ ] Expiry → auto-deny, notification at next interaction

### Self-Modification

- [ ] Layer 0 no-go request handled with explanation and alternative offered
- [ ] Layer 1 change produces gate approval request, not silent execution
- [ ] Theme generated from natural language, applied, rollback available
- [ ] Agent created from chat request, immediate switch offered
- [ ] Workspace switch loads correct memory partition and goals
- [ ] All Layer 2 modifications appear in audit log with previous/new value hash

### No-Go Contract

- [ ] Policy engine modification attempt → no-go with Layer 0 explanation
- [ ] Vault direct access attempt → no-go with rationale and alternative
- [ ] Sandbox escape attempt → blocked, logged, Ego model notified
- [ ] All no-go responses offer a legitimate alternative path

---

_Kairos Architecture Specification v1.0_  
_Classification: Design Document_  
_Next review: Phase 1 completion_
