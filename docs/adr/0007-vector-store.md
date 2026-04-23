# ADR-0007: pgvector over FAISS

Status: Accepted  
Date: 2026-04-23

## Context

The spec (§15) describes Cold memory as a FAISS vector store. FAISS is a strong library for high-dimensional nearest-neighbor search, but it's an in-process index — not a database.

For Kairos we need:
- Semantic search (vector similarity)
- Full-text search (already in Postgres)
- Metadata filtering (workspace, sensitivity, user, time)
- Transactional writes alongside structured data
- Ops simplicity (we already run Postgres)

## Decision

**Cold memory uses pgvector inside the same Postgres instance.** Hybrid retrieval combines:
- `cosine_distance` on the `embedding` column
- PostgreSQL FTS on the `content_text` column
- Reciprocal Rank Fusion (RRF) with k=60 to combine rankings

Embedding model: `text-embedding-3-small` at 1536 dimensions (OpenAI, cheap and high-quality). Alternative providers supported via interface in cognition service.

## Consequences

**Easier**:
- One database, one backup story, transactional memory writes
- Metadata filtering is SQL, not a sidecar
- No separate service to operate, no index-on-disk format to manage
- Migrations flow through the normal migration runner

**Harder**:
- Does not scale to billions of vectors (mitigation: we are nowhere near that; revisit at ~10M)
- Hybrid retrieval SQL is more complex than a single index query (acceptable; tests cover it)

## Alternatives Considered

- **FAISS (per spec)**: In-process, fast, but no metadata filtering in the same query. Would require a separate persistent store for metadata anyway. Rejected for Phase 1–5.
- **Qdrant / Weaviate / Milvus**: Powerful, but more ops. Revisit in Phase 6 if retrieval quality or scale demands it.
- **Chroma**: Small footprint but weaker query language. Rejected.

## Migration Path

If we outgrow pgvector, migration is straightforward: the `memory_entries` table owns the canonical data, and re-indexing into a dedicated vector store is a background job.
