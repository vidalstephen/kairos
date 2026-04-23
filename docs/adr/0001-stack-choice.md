# ADR-0001: Stack Choice

Status: Accepted  
Date: 2026-04-23

## Context

Kairos requires three distinct runtime concerns:

1. **Safety-critical control plane** — policy engine, approval state machine, credential vault interface, audit log, session lifecycle, auth. Must be type-safe, memory-safe, and well-structured with strong module boundaries.
2. **Cognition** — Ego process, model routing, provider adapters, re-voicing pipeline, utility workers. Needs fast iteration, ergonomic async, and first-class SDKs from every LLM provider.
3. **Frontend** — 3-pane chat UI with real-time streaming, approval drawer, briefing view. Needs mature component ecosystem and WebSocket support.

## Decision

- **Control plane**: NestJS 10 on Node 20 with TypeORM, pino, Passport/JWT, Zod for runtime validation.
- **Cognition**: Python 3.12 with `uv` package manager, pydantic v2, httpx, structlog, pytest.
- **Frontend**: Next.js 14 (App Router) with Tailwind + shadcn/ui + socket.io-client.
- **Data**: Postgres 16 with pgvector, Redis 7, MinIO (S3-compatible).

Monorepo uses pnpm workspaces + `uv` + a top-level Makefile. No Turborepo (doesn't help Python, adds ceremony).

## Consequences

**Easier**:
- Type safety where it matters most (Layer 0 in TS with `exactOptionalPropertyTypes: true`)
- Python SDKs from Anthropic, OpenAI, and OpenRouter are first-class
- Component ecosystem (shadcn/ui) gives us accessible primitives without framework lock-in
- Familiar pattern for the team; proven in prior Kairos iteration

**Harder**:
- Two language toolchains in CI
- Shared contracts require generation (Zod → JSON Schema → Python models). See `packages/schemas/`.
- Cross-service debugging requires correlated trace IDs across TS and Python

## Alternatives Considered

- **Monolingual Python (FastAPI for control plane too)**: Loses TS ergonomics for the 3-pane frontend and drops strong type safety at the policy boundary. Rejected.
- **Monolingual TypeScript (including cognition)**: LLM provider SDKs are better in Python; async semantics for provider streaming are cleaner in Python. Rejected.
- **Go control plane**: Strong safety story but smaller ecosystem for our domain (JWT, TypeORM equivalents). Rejected.
