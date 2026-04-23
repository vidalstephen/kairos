# Memory Architecture

Tiered memory model. See also: [ADR-0007](../adr/0007-vector-store.md), spec §15.

---

## Tiers

### Hot — In-Context Working Memory

- Lives in: inference context only, per-call
- Contents: current task brief, relevant fragments, active tool results, current session exchange
- Lifecycle: single inference call
- Management: Ego's context planner injects; nothing persisted

### Warm — Structured Episodic

- Lives in: Postgres `memory_entries` table, `scope='warm'`
- Contents: session summaries (written by utility worker at close), key-value facts, goal progress records, resolved approval history
- Lifecycle: 90 days full retention, then compacted to summary form (scope upgraded to `cold` or discarded)
- Write path: utility worker at session close + explicit `POST /memory` calls

### Cold — Semantic Long-Term

- Lives in: Postgres `memory_entries` table, `scope='cold'`, with pgvector column `embedding`
- Contents: document embeddings, skill reference material, cross-session pattern observations
- Lifecycle: permanent, re-indexed weekly
- Retrieval: hybrid (cosine + FTS + RRF)

### Global — Cross-Workspace

- `workspace_id IS NULL`
- Contents: Kairos self-observations that apply across workspaces, identity-level facts
- Access: all workspaces can read; writes gated by Layer 2 policy

---

## Write Policy

Every write goes through `WritePolicyService`:

1. **PII detection** — 5 regex classes: email, phone (loose intl), SSN-like, credit-card-like, IP addresses.  Matches escalate sensitivity.
2. **Credential detection** — 7 patterns: AWS keys, GCP keys, Stripe keys, generic API-key-shaped tokens, PEM headers, Bearer tokens, Basic auth.  Matches → **reject** unless explicit `sensitivity='secret'` and workspace `settings.allow_pii=true`.
3. **Size cap** — 16 KB per entry (content).  Larger content is rejected with `VALIDATION_FAILED` and guidance to split.
4. **Approval routing** — sensitivity `confidential|secret` writes land as `approval_state='pending'` and require explicit approval before retrieval. Others are `approval_state='auto'`.

Writes carry `source_type`: `session_summary | fact | doc | tool_result | self_observation`.

---

## Embedding

- Default: OpenAI `text-embedding-3-small` at 1536 dimensions
- Interface: `EmbeddingService.embed(text: str) -> List[float]`
- Graceful fallback: if embedding provider is down, entry is stored with `embedding=NULL` and queued for re-embedding by a utility worker
- Re-embedding: weekly full re-index or on embedding model upgrade

---

## Hybrid Retrieval — RRF Fusion

Query flow for `recall(workspace_id, query, limit, scope_filter)`:

```
1. Embed query → q_vec
2. Vector search:  SELECT id, 1 - (embedding <=> q_vec) AS score
                   FROM memory_entries
                   WHERE workspace_id = ? AND scope = ANY(?)
                   ORDER BY embedding <=> q_vec
                   LIMIT 50
3. FTS search:     SELECT id, ts_rank(fts_vector, plainto_tsquery(?)) AS score
                   FROM memory_entries
                   WHERE workspace_id = ? AND scope = ANY(?)
                     AND fts_vector @@ plainto_tsquery(?)
                   ORDER BY score DESC
                   LIMIT 50
4. RRF fusion:
   For each result, score_rrf = sum_over_rankings (1 / (k + rank))
   k = 60 (standard RRF constant)
5. ORDER BY score_rrf DESC, return top `limit`
```

Metadata filters (sensitivity floor, approval state, expiry) are applied inside both subqueries before fusion.

---

## Context Assembly (Ego-Side)

The Ego's context planner fills the inference budget in priority order:

```
1. Immutable:     system prompt core + current persona           (~500 tok)
2. Task brief:    the current task brief                         (~200 tok)
3. Warm fragments: scored by task relevance + recency            (~1500 tok)
4. Tool schemas:  only tools relevant to this task               (~500 tok)
5. Workspace:     active workspace context                       (~300 tok)
6. Cold fragments: top-K from RRF retrieval                      (~1500 tok)
7. Conversation:  recent history, compressed if needed           (~1000 tok)
8. Spare:         fill remaining budget with additional fragments
```

Budget is model-specific. Cognition service enforces a per-call token budget and truncates the lowest-priority section first.

---

## Compaction Schedule

A utility worker runs on cron (default: daily 03:00 UTC):

- Session summaries >7 days old → compressed to 3-sentence abstract (LLM, Stratum 4)
- Session summaries >90 days → compressed to single-line entry (Stratum 4)
- `memory_entries` with `expires_at < NOW()` → hard-deleted (policy-configurable)
- Weekly (Sunday): pgvector HNSW reindex, autovacuum analyze on memory_entries
- Completed goals: archived after 30 days

Compaction emits audit events `memory.compacted` per batch.

---

## Retention

| Category | Default |
|---|---|
| Warm full content | 90 days |
| Cold content | permanent |
| Session exchanges (messages table) | 90 days full, then compacted |
| Expired-marked entries | honored on next compaction run |

Per-workspace overrides via `workspace.settings.retention_policy`.

---

## API Surface (see [docs/specs/api-http.md](api-http.md))

```
POST   /memory          Write
GET    /memory          List
GET    /memory/:id
DELETE /memory/:id      Soft-delete then compact
POST   /memory/:id/approve
POST   /memory/:id/reject
POST   /memory/recall   Hybrid retrieval
```

Tool equivalents: `memory_recall(query, limit)`, `memory_store(content, scope, sensitivity?, metadata?)`.

---

## Security

- No raw credentials reach memory — WritePolicyService rejects before insert
- Memory reads honor workspace isolation (joins through `workspace_members`)
- Sensitive entries (`confidential|secret`) never appear in Ego's automatic context assembly; they must be explicitly requested by the user or by an approved tool call

---

## Operational Notes

- HNSW index parameters: `m=16, ef_construction=64`. Tune if recall quality degrades.
- Index build is offline; use `CREATE INDEX CONCURRENTLY` in migrations post-initial.
- Query parameters expose `ef_search=40` at runtime for latency/recall tradeoff.
