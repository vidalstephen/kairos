# Architecture Decision Records

Decisions that shape Kairos. Each ADR is immutable once accepted; supersede rather than edit.

| # | Title | Status |
|---|---|---|
| [0001](0001-stack-choice.md) | Stack: TS control-plane + Python cognition + Next.js | Accepted |
| [0002](0002-container-topology.md) | Single container with Linux namespace lanes | Accepted |
| [0003](0003-self-state-format.md) | Self-state as Markdown + JSON shadow | Accepted |
| [0004](0004-policy-engine-placement.md) | Policy engine in TypeScript control-plane | Accepted |
| [0005](0005-credential-vault.md) | Vault as separate process with alias-only interface | Accepted |
| [0006](0006-approval-storage.md) | Approvals in Postgres with Redis pub/sub bridge | Accepted |
| [0007](0007-vector-store.md) | pgvector over FAISS for cold memory | Accepted |
| [0008](0008-cognition-service.md) | Ego + task dispatch in single Python service | Accepted |
| [0009](0009-model-providers.md) | OpenRouter + direct Anthropic + direct OpenAI | Accepted |
| [0010](0010-capability-tokens.md) | HMAC-SHA256 capability tokens for tool auth | Accepted |
| [0011](0011-deployment.md) | Cloudflare Tunnel for public routing, Traefik for middleware | Accepted |
| [0012](0012-telemetry.md) | OTel-compatible spans stored in Postgres, exported via OTLP | Accepted |

## Template

```
# ADR-NNNN: Title

Status: Proposed | Accepted | Superseded by ADR-XXXX
Date: YYYY-MM-DD

## Context
What is the issue motivating this decision?

## Decision
What we are doing.

## Consequences
What becomes easier. What becomes harder. Tradeoffs.

## Alternatives Considered
Options evaluated and why they were rejected.
```
