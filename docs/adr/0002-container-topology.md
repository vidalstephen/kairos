# ADR-0002: Container Topology

Status: Accepted  
Date: 2026-04-23

## Context

The architecture spec (§10.1) calls for a single Kairos container using Linux namespaces and cgroups to create isolated execution lanes: Ego Process, Tool Execution Lane, Install Sandbox, Credential Proxy.

We need to decide how this maps to our actual Docker Compose topology.

## Decision

For development and production, use **multiple Docker Compose services with shared volumes and internal networks**, not literal Linux namespaces in a single container.

- `control-plane` — NestJS, holds Layer 0 services (policy engine, approval state machine, audit)
- `cognition` — Python, holds Ego process + task dispatch + utility workers
- `vault` — separate container for credential vault with isolated volume
- `executor` — ephemeral container spawned per tool call (Docker-in-Docker via socket mount)
- `frontend` — Next.js
- `postgres`, `redis`, `minio` — data plane

The spec's "single container with namespaces" model is treated as a **logical boundary** — the security guarantees (no network by default in the tool lane, resource quotas, cgroup isolation) are provided by Docker + per-container network modes + resource limits, not by in-container namespace splits.

The `executor` container is spawned by `control-plane` via Docker Engine API (Unix socket mount), runs on an internal `kairos-sandbox` network with no external egress by default, and is destroyed after each tool call.

## Consequences

**Easier**:
- Standard Docker ops: logs, restart, resource limits per service
- Can scale cognition independently of control plane
- Vault isolation is a filesystem + network boundary, not a namespace trick
- Works on Docker Desktop, Linux Docker, and managed platforms without privileged mode

**Harder**:
- Control plane needs Docker socket access (mitigated: read limited set of Docker Engine API endpoints; socket group membership enforced)
- More moving parts in Compose

## Alternatives Considered

- **Literal single container with `unshare` + cgroup manipulation**: Requires privileged mode or complex capability grants. Makes development painful. Rejected.
- **Firecracker microVMs for the tool lane**: Overkill for Phase 1–4. Revisit if we need hard-multi-tenant isolation.
