# ADR-0008: Single Cognition Service

Status: Accepted  
Date: 2026-04-23

## Context

The spec (§3.1) lists four components that "always run" or run "on demand": Ego Process (always), Reasoning Model (on-demand), Specialist Models (on-demand), Utility Workers (on-demand).

We need to decide whether each is a separate service/process or whether they co-locate.

## Decision

**One Python service named `cognition` hosts all four.** Within it:

- **Ego loop** — a long-running async task (heartbeat every 15m + event-triggered) that maintains self-state, processes incoming session messages, and dispatches work
- **Task dispatcher** — the path that invokes Reasoning / Specialist / Utility models via the provider router
- **Utility workers** — async tasks or short-lived subprocesses for memory compaction, relevance scoring, structured extraction
- **Provider router** — pluggable adapters for Anthropic, OpenAI, OpenRouter with failover

No separate microservices. No inter-service messaging for the cognition layer. All four strata share one address space and one provider-key config.

## Consequences

**Easier**:
- Ego can call task dispatch in-process — no network, no serialization
- One service to deploy, one codebase to search, one log stream per session
- Shared utilities (tokenization, cost tracking, provider clients) don't get duplicated
- Backpressure is local: Ego can directly observe dispatcher queue depth

**Harder**:
- A bug in a utility worker can crash the Ego loop (mitigation: supervise each task with a process supervisor; catch and log all exceptions; Ego loop restarts on crash)
- Scaling Ego vs heavy workloads is coupled (mitigation: run multiple cognition replicas with session-affinity routing — cognition is stateless between sessions; self-state lives in Postgres)

## Alternatives Considered

- **Ego as one service, dispatch as another**: Doubles the ops footprint, adds a network hop per task, gains little.
- **Separate workers for each stratum**: Maps 1:1 to spec but creates 3–4 services that are mostly just thin wrappers around provider calls. Over-engineered.
