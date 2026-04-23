# ADR-0005: Credential Vault

Status: Accepted  
Date: 2026-04-23

## Context

Kairos must hold its own credentials (GitHub PAT, email SMTP, API keys, webhook signing keys). These must never enter an LLM context window or log output. The architecture spec (§11.3) mandates alias-only resolution.

## Decision

**Vault is a separate process in its own container with an isolated volume.** It exposes a minimal HTTP API on an internal-only network:

```
POST /vault/resolve         Body: { alias, caller, purpose }   → { resolved, access_id }
POST /vault/metadata        Body: { alias }                    → { description, rotates_at, scope }
POST /vault/rotate          Body: { alias }                    → { new_rotates_at }
GET  /vault/aliases         → [{ alias, description, rotates_at, last_accessed }]
POST /vault/store           Body: { alias, value, metadata }   → { stored: true }
```

Storage is encrypted at rest using age (https://github.com/FiloSottile/age) with a master key loaded from a file mounted read-only from the host (outside the container image).

**The critical invariant**: any call to `/vault/resolve` returns the value to the **policy engine** (in the control plane), which injects it directly into the tool call payload dispatched to the executor. The raw value never traverses the cognition service and never enters any LLM inference call.

Every resolution generates an `access_id` logged in the audit table with caller, purpose, timestamp, and downstream tool invocation.

## Consequences

**Easier**:
- Clean security boundary: vault container has no Internet access, no database access, no shared memory with cognition
- Easy to audit: one table (`credential_access_log`), one process, one file to back up
- Rotation is a local concern — no LLM context window to worry about

**Harder**:
- One more service to operate
- Master key bootstrap: we need to decide how the key reaches the vault at startup (decision: file mount from host, out of band of the repo)

## Alternatives Considered

- **HashiCorp Vault**: Full-featured but complex ops for a single-deployment system. Revisit in Phase 6 if we multi-tenant.
- **Env vars**: Fails the "never in LLM context" test because cognition would need them in memory. Rejected.
- **AWS KMS / GCP KMS**: Cloud lock-in; over-engineered for the single-node deployment target. Rejected.
