# ADR-0004: Policy Engine Placement

Status: Accepted  
Date: 2026-04-23

## Context

The policy engine is the Layer 0 service that classifies every tool call by blast radius, checks credential access, validates network domains against allowlists, and triggers the approval state machine when appropriate.

It is safety-critical. A bug here is a security incident.

Two candidate homes:
1. **TypeScript in the control plane** — same process as the approval state machine, audit log, and capability token service
2. **Python in the cognition service** — same process as the Ego that requests tool calls

## Decision

**Policy engine lives in the TypeScript control plane.** The cognition service calls into it via an authenticated internal RPC endpoint (HMAC-signed, `X-Internal-Service: cognition` header) for every tool dispatch.

## Consequences

**Easier**:
- TypeScript `exactOptionalPropertyTypes: true` + Zod validation makes policy input validation rigorous
- Same process as the approval state machine, audit, and capability tokens — no cross-service state for safety-critical flows
- Easier to write comprehensive tests (policy engine gets 100% branch coverage as a hard target)
- Central place to enforce that no tool call skips the classifier

**Harder**:
- Extra network hop for every tool call from cognition (mitigated: internal network, ~1ms, negligible vs model inference)
- Requires a stable internal RPC contract between services

## Alternatives Considered

- **Python in cognition**: Co-locates policy with the caller but duplicates safety code across two services (Python cognition + TS control plane would each need their own classifier for defense in depth — still ends up in both, so pick one as authoritative). Rejected.
- **Shared library in both languages**: Maintenance burden, drift risk. Rejected.
- **WASM module callable from both**: Interesting but overkill for Phase 1. Revisit if we extract Layer 0 into its own binary.
