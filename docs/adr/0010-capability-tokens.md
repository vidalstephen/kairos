# ADR-0010: Capability Tokens

Status: Accepted  
Date: 2026-04-23

## Context

When the cognition service dispatches a tool call, the executor must verify the call was authorized by the policy engine — not crafted by a compromised or confused model. We need a short-lived, verifiable token.

## Decision

**HMAC-SHA256 capability tokens.**

- Shared secret between policy engine (issuer) and executor (verifier), held in vault alias `vault://kairos-capability-hmac`
- Token payload: `{ run_id, tool_id, params_hash, issued_at, expires_at }`
- Signature: HMAC-SHA256(secret, JSON.stringify(payload))
- Token format: `base64url(payload) + "." + base64url(signature)`
- Expiry: 60 seconds from issue
- Timing-safe comparison on verify

Token is included in the tool call dispatch to the executor. Executor verifies before dispatching the tool binary.

## Consequences

**Easier**:
- Symmetric (HMAC) is simpler and faster than asymmetric for internal-only use
- Payload is opaque to the LLM: even if the cognition service is compromised, the attacker cannot mint tokens without the vault secret
- Short expiry means replay attacks have a 60s window

**Harder**:
- Secret rotation requires coordinated config update (mitigation: vault supports dual-key resolve for overlap window)

## Alternatives Considered

- **JWT (RS256)**: Asymmetric is unnecessary for an internal issuer/verifier pair. More ceremony, same security. Rejected.
- **mTLS**: Provides authentication but not per-call authorization — we still need per-call policy decisions attached to each dispatch. Rejected.
- **Unsigned token + network trust**: Rejected on principle.
