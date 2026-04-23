# Control Plane

NestJS 10 service. Authoritative boundary for safety: owns approvals, policy, capability tokens, vault gateway, audit, self-state persistence.

See [../../docs/architecture.md](../../docs/architecture.md) and [../../docs/specs/](../../docs/specs/).

## Dev

```bash
pnpm install
pnpm dev              # watch mode
pnpm test             # unit tests
pnpm test:integration # requires docker-compose up
pnpm lint
pnpm typecheck
```

## Layout (target, built up across phases)

```
src/
  main.ts
  app.module.ts
  config/
  common/              # filters, guards, pipes, middlewares
  database/
    migrations/
  modules/
    auth/
    workspaces/
    sessions/
    runs/
    tools/
    memory/
    policy/
    approvals/
    vault/             # RPC client to vault service
    self-state/
    audit/
    health/
```

## Phase 0

Only boots, exposes `/api/v1/health/live`, connects to Postgres + Redis on startup. Real modules land in Phase 1.
