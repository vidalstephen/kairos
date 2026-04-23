# Frontend

Next.js 14 (App Router) + Tailwind + shadcn/ui. Single UI for chat, approvals, trace, settings.

See [../../docs/specs/api-http.md](../../docs/specs/api-http.md) and [../../docs/specs/api-websocket.md](../../docs/specs/api-websocket.md).

## Dev

```bash
pnpm install
pnpm dev
pnpm test:e2e    # Playwright, requires the full stack up
pnpm lint
pnpm typecheck
```

## Phase 0

Boots, serves a placeholder landing page, no auth yet. Login + session UI lands in Phase 1.
