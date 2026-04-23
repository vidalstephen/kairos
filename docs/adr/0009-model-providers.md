# ADR-0009: Model Provider Strategy

Status: Accepted  
Date: 2026-04-23

## Context

Kairos uses four strata with different cost/latency/capability profiles. Vendor risk (rate limits, API deprecation, outages, price changes) is real and must be mitigated.

## Decision

**Support three providers from day one, with failover:**

1. **Direct Anthropic** — primary for Stratum 1 (Ego, Haiku) and Stratum 2 (Reasoning, Sonnet/Opus)
2. **Direct OpenAI** — primary for embeddings (text-embedding-3-small) and secondary for Stratum 2 (GPT-4o)
3. **OpenRouter** — fallback for all strata, and primary access path for specialty models (open-weights, niche providers)

Routing:
- Each request specifies a desired model (by config or by task type)
- Router tries direct provider first if available, falls back to OpenRouter, then to the next failover in the chain
- Failover chain configured per stratum in `docs/specs/model-routing.md`

Cost ceilings enforced at two levels:
- Per-run token budget (provided at dispatch)
- Per-workspace monthly cap (soft warn at 80%, hard block at 100%)

## Consequences

**Easier**:
- Vendor outage tolerance: Anthropic down → OpenRouter path still serves Claude
- Specialty models (open-weights for utility tasks) accessible through one client
- Direct providers give lowest latency for primary paths

**Harder**:
- Three API shapes to abstract (mitigation: provider adapter pattern with a single internal Message type)
- Token counting differs per provider (mitigation: use each provider's native tokenizer)
- Cost tracking must normalize across providers (mitigation: per-provider pricing table in config)

## Alternatives Considered

- **OpenRouter only**: Convenient but adds a hop and a SPOF. Rejected.
- **Direct providers only**: No open-weights path for utility workers and no graceful Anthropic-outage fallback. Rejected.
- **Bedrock / Vertex**: Cloud lock-in; not aligned with self-hosted deployment target.
