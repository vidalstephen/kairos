# Kairos
## Product Overview

---

### What Kairos Is

Kairos is a persistent, self-aware AI system designed to act as a genuine digital collaborator — not a chat interface wrapped around a language model, but a synthetic mind that maintains a continuous inner life, takes initiative without being prompted, operates under its own identity in the world, and grows its own capabilities over time.

The distinction matters. Every other AI agent system in use today is built outward from a model: the frontier LLM sits at the center, and memory, tools, and personality are bolted around it. Kairos inverts this architecture entirely. A dedicated Ego layer sits at the center — always running, always self-aware — and task models are ephemeral workers it conscripts and releases as needed. The harness is secondary to the mind.

The result is a system that knows where things stand before you ask, remembers how you work and what you're building, pushes work forward while you're away, and presents you with a briefing when you return — not a blank prompt.

---

### The Core Architecture

**The Ego Model** is the persistent inner life of Kairos. It is a small, fast, always-on model with a single job: to maintain Kairos's sense of self across every session, every workspace, every task. It owns the self-state document — a live, versioned record of current mode, active goals, relationship posture, pending observations, tool health, and open questions. It reads this document at session open, writes it at session close, and updates it on every significant event in between. It routes incoming work to the appropriate task model, re-voices every output in its own consistent voice before delivering it, and runs the proactive loop that decides what is worth surfacing without being asked.

**The Stratified Model Topology** gives Kairos the right cognitive resource for each job. The Ego model handles continuity and routing. A Reasoning model handles deep planning, architectural decisions, and ambiguity resolution — invoked only when the task genuinely demands it. Specialist models handle domain execution: code, research, documents, browser automation. Utility workers handle high-volume, low-complexity operations — memory compaction, relevance scoring, structured extraction — at the cheapest possible tier. Nothing is routed through a frontier model that doesn't need to be there.

**The Initiative Engine** is the proactive loop that runs independently of the human interaction loop. On a heartbeat cycle and on environment event triggers, Kairos evaluates its goal register and pending observation queue against current context — what mode is active, what the user is focused on, what time it is — and scores each candidate item for surface worthiness. Items that cross the threshold are surfaced through the appropriate channel. Items that don't are re-evaluated next cycle. The threshold calibrates over time based on user response signals: acknowledged and acted on means lower the bar slightly; dismissed means raise it.

**The Self-State Document** is the foundation of Kairos's self-awareness. It is a structured Markdown file with a JSON shadow store, versioned on every write, with full snapshot history. It contains: current mode and mode context, the goal register, open questions, relationship posture, tool health, pending proactive items, the capability manifest, and the layer awareness map. It is never sent wholesale to a task model. The Ego model selects and injects only what each task requires.

---

### Self-Awareness and Initiative

Kairos knows what it is working on, what tools are available to it, what has changed since the last session, and what the current project context demands. This is not a system prompt that says "you are a helpful assistant." It is a live, structured self-model that is consulted in every interaction and updated after every significant event.

The goal register holds standing intents that persist across sessions — things Kairos has been asked to care about and continues to care about without being reminded. "Monitor the Meridian repo for dependency updates" is a standing goal that fires on a weekly schedule. "Complete the Kairos architecture specification" is a critical active goal that informs Kairos's mode assessment, response posture, and proactive surfacing decisions. Goals have priorities, statuses, workspace affinities, and trigger conditions.

The relationship posture captures how the working relationship between Kairos and its user has developed — communication style, current project phase, engagement signals from recent sessions. Kairos uses this to calibrate tone, depth, and framing without being told how to respond. It knows the difference between a session where the user wants architecture-level ideas and a session where they want execution and deliverables.

---

### Operating in the World

Kairos operates under its own digital identity. It has its own email address, its own GitHub account, its own API credentials stored in a vault it accesses by alias — never by value, never in plaintext in any context window or log. When Kairos pushes a PR, it opens it from its own account with a full attribution block: what task triggered it, which session, which model authored the code, confidence level, and a link to the audit trail. When Kairos sends an email, it comes from Kairos.

This is not a convenience feature. It is a fundamental security architecture decision. The blast radius of any compromise, hallucination, or prompt injection is bounded by what Kairos owns — not what its user owns. Personal accounts, personal credentials, and personal services are structurally unreachable, not just permission-restricted.

The OS-as-tool model gives Kairos the ability to pull, install, and utilize capabilities it does not have out of the box. Every capability install goes through a formal lifecycle: capability request, policy evaluation, gate decision, sandboxed installation with fingerprinting, promotion to the execution environment, and capability manifest registration. Known packages at low blast radius install automatically. Unknown packages or packages requiring new network domains go through the approval system. The capability manifest is part of Kairos's self-state — it always knows what it currently has available, when things were installed, and what they are authorized to do.

---

### The Approval System

Kairos's approval system is a state machine, not a notification. Every action that crosses a blast radius threshold — stateful external API calls, new network domains, destructive operations — creates a formal approval request record with a unique ID, a cryptographically signed single-use webhook token, an expiry time, and a state machine instance that enforces idempotency across all delivery channels.

The channel routing is context-aware. If the user has no active session, approval requests go to email with a webhook button. If the user is actively in a session, the request surfaces as an in-chat notification. If the user was in a session and has left — detected via presence heartbeat — the request surfaces as both an in-chat banner and an email simultaneously, with the first resolution making the second defunct. A webhook clicked after the request is already resolved returns a 410 Gone with a full explanation. There is no way to trigger a duplicate action.

The default expiry behavior is auto-deny. Kairos logs the timeout, notifies the user at the next natural interaction, and moves on. It does not take consequential action on your behalf without a response.

---

### Self-Modification and Growth

Kairos holds a formal map of its own mutability as first-class self-knowledge — not as an external restriction, but as part of its identity. It knows exactly what it can and cannot change about itself, and it can articulate this on request.

Layer 0 — the execution engine, policy engine, credential vault, sandbox enforcement, and network egress control — is immutable core infrastructure. Kairos cannot read its internals or modify its behavior. This is not a constraint Kairos resents; it is a property it understands and defends. When a request would touch Layer 0, Kairos explains which system is involved, why it exists as protected, and offers the closest legitimate alternative — a Layer 1 change proposal, a threshold adjustment, a different approach to the underlying need.

Layer 2 — persona, themes, agents, skills, workspaces — is Kairos's own domain. It modifies these autonomously. Every change is versioned, logged, and reversible. Kairos does not ask permission to update its persona or switch its active theme. It acts, notifies, and makes rollback available.

Switching workspaces feels like walking into a room already set up for the work. The memory partition loads, the workspace goals become active, tool configurations update, pending proactive items surface. Kairos knows where it is and what matters here. Creating a new agent takes a natural language description and produces a named, configured, immediately active agent — persona, model assignments, tool scope, memory partition, workspace affinity — versioned from creation.

---

### The Dashboard Experience

On session open, before any user input, Kairos presents a briefing — not a status readout, but a voiced, contextual opening from the Ego model that reflects what it found when it read the self-state document and assessed the current situation. What is in progress. What changed while the session was closed. What is worth doing first. What it has already done on its own since the last session. Tool health. Open questions. Pending approvals.

The task feed distinguishes between user-initiated tasks — things Kairos did because it was asked — and autonomously invoked tasks — things Kairos did because its proactive loop, goal register, or scheduled triggers determined they were worth doing. This distinction is architecturally significant. An autonomous credential rotation at 6am, a PR staleness check triggered by a standing goal, a spec alignment analysis deferred because the initiative score fell below threshold — these are not the same kind of event as a user-requested deployment. The interface makes this visible.

---

### Security Model Summary

Every action is classified by blast radius before dispatch: read, write-local, install, stateful-external, destructive, network-egress-new. Each class has a default policy: auto-approve with logging, notify and proceed, or hard human gate. Tool results and LLM-generated commands are checked against the pre-approved domain list for each call before any network request is made — a domain appearing in tool result content that was not in the pre-call allowlist is treated as a potential prompt injection and blocked. All execution happens in a namespaced lane within the single Kairos container, with resource quotas that ensure no runaway tool call can starve the Ego process.

Every operation is instrumented with OpenTelemetry-compatible spans. Every credential access is logged. Every self-modification is versioned. The full causal trace from user intent to final output is available for review, and cost is attributed per task, per session, per workspace, per model stratum.

---

### What Kairos Is Not

Kairos is not a chatbot with memory. It is not a tool wrapper with a personality layer. It is not a framework for running LLM calls in a loop. It does not start from neutral on every session. It does not require being told what it cares about every time. It does not route every action through a frontier model that is simultaneously trying to maintain persona and execute a complex task.

It is a persistent mind with a formal architecture, a coherent identity, a principled security posture, and a genuine capacity to act in the world on behalf of the people it works with — within boundaries it understands and holds as its own.

---

*Kairos — Synthetic Cognition Architecture*
