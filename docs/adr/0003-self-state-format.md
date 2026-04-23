# ADR-0003: Self-State Document Format

Status: Accepted  
Date: 2026-04-23

## Context

The self-state document is Kairos's working memory of itself. It must be:
- Readable and editable by humans (for debugging, audit, trust)
- Structured enough for programmatic access by the proactive loop, approval router, and tool health checks
- Versioned with full snapshot history
- Stable across schema evolution

## Decision

**Markdown file with frontmatter metadata is the source of truth. A JSON shadow store is derived on every write for programmatic access.**

- Markdown lives in Postgres (`self_state_snapshots` table) as text with a version integer
- Every write produces a new row (append-only) — previous versions are never modified
- JSON shadow is derived deterministically from the Markdown; stored alongside but never authoritative
- A JSON Schema in `packages/schemas/self-state.schema.json` validates the JSON shadow
- Markdown sections map 1:1 to top-level JSON keys (see [docs/specs/self-state-schema.md](../specs/self-state-schema.md))

## Consequences

**Easier**:
- Humans can read the self-state directly as a document — critical for trust
- Version history is a simple `ORDER BY version DESC` query
- Debugging is a cat away, not a schema tool away
- Ego model writes to a format it naturally produces (Markdown)

**Harder**:
- Parser complexity: MD → JSON must be deterministic and symmetric
- Schema evolution requires coordinating MD template + JSON Schema + parser
- Cannot do partial updates — every write is a full snapshot

## Alternatives Considered

- **JSON only**: Loses human readability, loses Markdown's natural affordances for prose fields (mode_context, last_session_summary)
- **YAML**: Whitespace sensitivity is a footgun for LLM-generated content
- **Protobuf/SQLite**: Over-engineered for a document written dozens of times per day
