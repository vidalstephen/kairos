# Deployment

Target environment: Hostinger VPS `srv1131719` at `ops@31.187.72.46`, public URL `kairos.vectorhost.net` via Cloudflare Tunnel.

See [ADR-0011](../adr/0011-deployment.md).

---

## Topology

```
Internet
   │
   ▼
[ Cloudflare Edge ]
   │
   ▼
[ cloudflared-vps0 container ]          (infra stack on the VPS)
   │                                    tunnel ID: 8a6e0d58-bd78-42c3-931a-284a384b1fe6
   │  proxy docker network
   ▼
[ kairos-frontend:3000 ]
   │  internal
   ▼
[ kairos-control-plane:3001 ]
   │        │
   │        ▼
   │   [ kairos-cognition:8000 ]
   │        │
   │        └─▶ Anthropic / OpenAI / OpenRouter (external, via cloud egress)
   │
   ├─▶ [ kairos-postgres ]
   ├─▶ [ kairos-redis ]
   ├─▶ [ kairos-minio ]
   └─▶ [ kairos-vault ]       (kairos-internal network only)

kairos-executor-N (ephemeral, spawned per tool call on kairos-sandbox network)
```

## Networks

| Network | Purpose |
|---|---|
| `proxy` | Shared with cloudflared; frontend exposes here |
| `kairos-internal` | control-plane ↔ cognition ↔ vault ↔ data layer; no internet |
| `kairos-sandbox` | executor container; allowlisted egress only |

Control plane has multiple network attachments (internal + per-tool-call ephemeral join to sandbox). Cognition has internal + host-external (for provider API calls).

## Initial Deploy

Ran once during Phase 5.6. Uses the `add-docker-service` skill:

1. Generate the compose file from the templates in `infra/compose/`
2. Provision `kairos.vectorhost.net` CNAME to the tunnel (via CF API, using token from `~/docker/infra/traefik/.env`)
3. Add ingress rule to cloudflared config pointing to `kairos-frontend:3000`
4. Restart cloudflared container
5. Bring up Kairos stack: `docker compose -f infra/compose/docker-compose.yml -f infra/compose/docker-compose.prod.yml up -d`
6. Seed master key mount for vault (manual, offline transfer)
7. Run migrations (automatic on control-plane start)
8. Verify: `curl -I https://kairos.vectorhost.net`

## Ongoing Deploys

Trigger: push to `kairos/main` → GitHub Actions deploys.

Workflow: `.github/workflows/deploy.yml`

```
on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - ssh into ops@31.187.72.46
      - cd ~/docker/apps/stacks/kairos && git fetch && git reset --hard origin/main
      - docker compose -f infra/compose/docker-compose.yml -f infra/compose/docker-compose.prod.yml pull
      - docker compose -f ... up -d
      - curl -fsS https://kairos.vectorhost.net/api/v1/health/ready || exit 1
      - report status to issue tracker
```

Secrets required in the GH repo: `VPS_SSH_PRIVATE_KEY`, `VPS_HOST`, `VPS_USER`.

## Environment Variables

`.env.example` committed at repo root. Production `.env` lives on VPS only (not in repo).

Key variables:
```
# Database
POSTGRES_HOST=kairos-postgres
POSTGRES_DB=kairos
POSTGRES_USER=kairos
POSTGRES_PASSWORD=<vault://kairos-postgres-password>

# Redis
REDIS_HOST=kairos-redis

# MinIO
MINIO_ENDPOINT=kairos-minio:9000
MINIO_ACCESS_KEY=<vault://kairos-minio-access>
MINIO_SECRET_KEY=<vault://kairos-minio-secret>

# Vault
VAULT_URL=http://kairos-vault:9000
VAULT_AUTH_SECRET=<from host file>

# JWT
JWT_ACCESS_SECRET=<vault alias>
JWT_REFRESH_SECRET=<vault alias>
APPROVAL_HMAC_SECRET=<vault alias>

# Providers (resolved at runtime via vault aliases)
ANTHROPIC_API_KEY_ALIAS=kairos-anthropic-key
OPENAI_API_KEY_ALIAS=kairos-openai-key
OPENROUTER_API_KEY_ALIAS=kairos-openrouter-key

# Telemetry (optional)
OTEL_EXPORTER_OTLP_ENDPOINT=
OTEL_EXPORTER_OTLP_HEADERS=
```

Vault aliases themselves are bootstrapped via `POST /vault/store` at first-deploy time (see `scripts/seed-vault.sh`).

## Resource Limits (prod)

```yaml
services:
  kairos-control-plane:
    deploy:
      resources:
        limits: { cpus: "1.5", memory: 1G }
  kairos-cognition:
    deploy:
      resources:
        limits: { cpus: "2.0", memory: 2G }
  kairos-frontend:
    deploy:
      resources:
        limits: { cpus: "0.5", memory: 512M }
  kairos-vault:
    deploy:
      resources:
        limits: { cpus: "0.25", memory: 256M }
  kairos-postgres:
    deploy:
      resources:
        limits: { cpus: "2.0", memory: 2G }
```

Per-executor: `cpus: "1.0", memory: 1G, pids_limit: 256` (configurable per tool).

## TLS

Handled by Cloudflare (full-strict). Internal traffic is plaintext on the internal docker networks. No `https://` inside the cluster.

## Rollback

```bash
cd ~/docker/apps/stacks/kairos
git log --oneline -10                   # find previous good commit
git reset --hard <good-commit>
docker compose -f infra/compose/docker-compose.yml -f infra/compose/docker-compose.prod.yml pull
docker compose -f ... up -d
```

If rollback includes a DB migration rollback: generate a down migration, run it, then roll the image. Never skip — forward-fix is usually safer.

## Blue/Green (Phase 6)

Not in scope for initial release. Single-node, downtime acceptable for migrations.

## Local Dev

```bash
make bootstrap     # installs deps, pulls images, seeds dev data
make up            # starts dev stack
make logs          # tails all services
make test          # runs full test suite
make down          # stops stack
```

Local `.env` differs: no cloudflared, frontend exposes port 3000 directly, vault uses a dev-only master key under `.dev/master.key` (gitignored).
