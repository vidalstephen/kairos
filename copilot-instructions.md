# Copilot Instructions — Kairos

You are working on Kairos, a persistent self-aware AI system. Read [AGENTS.md](AGENTS.md) before making changes. Key rules:

## Before Any Change
- Consult [docs/architecture.md](docs/architecture.md) for normative behavior
- Never modify Layer 0 without an ADR and human approval (see [docs/specs/layer-map.md](docs/specs/layer-map.md))
- Every new public surface requires a test

## Stack
- **Control plane**: NestJS 10 + TypeORM + pino + Passport/JWT + Zod
- **Cognition**: Python 3.12 + pydantic v2 + httpx + structlog + `uv` package manager
- **Frontend**: Next.js 14 (App Router) + Tailwind + shadcn/ui + socket.io-client
- **Data**: Postgres 16 + pgvector + Redis 7 + MinIO (S3-compatible)
- **Executor**: Alpine Docker image, non-root user 1000:1000

## Code Style
- TypeScript: `exactOptionalPropertyTypes: true`; use spread pattern for optionals; Zod for runtime validation
- Python: Ruff + mypy strict; pydantic v2 models; async-first; structlog with request_id binding
- Error envelope: `{ code, message, details, request_id }` — consistent across all services
- Timestamps: ISO8601 UTC; IDs: UUID v4

## Testing
- TS: vitest (unit) + supertest (integration) + Playwright (e2e)
- Python: pytest + pytest-asyncio
- Integration tests share one login in `beforeAll` to avoid rate limit (5/15min)
- Do **not** use esbuild for NestJS integration tests — SWC is required for decorator metadata

## Security
- Never log credentials, even redacted hashes
- Never put resolved credentials in LLM context
- Test fixtures use clearly fake tokens to avoid Trivy false positives
- All WebSocket events carry `request_id` for trace correlation

## Don't
- Don't invent new error shapes
- Don't add abstraction layers not demanded by a concrete second use case
- Don't change a spec without updating `docs/specs/`
- Don't commit generated files
- Don't use backticks in file references in markdown — use links
