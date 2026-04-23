# Operations Runbook

Living document. Update after every incident.

---

## Service Map

| Service | Container | Depends on | Health endpoint |
|---|---|---|---|
| Frontend | `kairos-frontend` | control-plane | `GET /api/health` |
| Control plane | `kairos-control-plane` | postgres, redis, vault | `GET /api/v1/health/ready` |
| Cognition | `kairos-cognition` | control-plane, postgres, redis | `GET /health` |
| Vault | `kairos-vault` | — | `GET /vault/health` (internal only) |
| Postgres | `kairos-postgres` | — | `pg_isready` |
| Redis | `kairos-redis` | — | `redis-cli PING` |
| MinIO | `kairos-minio` | — | `GET /minio/health/live` |

## Normal Ops

### Deploy

```bash
# From the VPS
cd ~/docker/apps/stacks/kairos
git pull
make prod-up   # runs compose with .prod.yml overrides, runs migrations on start
```

Compose overrides in `infra/compose/docker-compose.prod.yml` include resource limits, log drivers, and the `proxy` network attachment.

### Logs

```bash
docker compose logs -f kairos-control-plane
docker compose logs -f kairos-cognition
docker compose logs --since=1h kairos-vault
```

Log format: structured JSON (pino / structlog). Key fields: `level`, `time`, `msg`, `trace_id`, `session_id`, `service`.

### Restart Single Service

```bash
docker compose restart kairos-cognition
```

### Run Migrations

Migrations run automatically on control-plane start. Manual run:

```bash
docker compose exec kairos-control-plane pnpm migration:run
```

### Scale Cognition (Phase 6)

```bash
docker compose up -d --scale kairos-cognition=2
```

Session affinity is handled by Redis — any cognition instance can pick up any session.

## Health Checks

All services expose a health endpoint. Compose healthchecks wired:

```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:PORT/health"]
  interval: 30s
  timeout: 5s
  retries: 3
```

`GET /api/v1/health/ready` (control plane) returns `503` if any dependency is unreachable.

## On-Call Playbooks

### Control Plane Down

1. `docker compose ps` — check status
2. `docker compose logs --tail=200 kairos-control-plane` — look for crash reason
3. Common causes:
   - Postgres unreachable → check `kairos-postgres` status + disk space
   - Vault unreachable → see Vault Unreachable playbook
   - Startup migration failure → check migration logs, manually inspect DB state
4. Restart: `docker compose restart kairos-control-plane`
5. If persistent: capture logs, open incident doc, roll back deploy

### Cognition Down

1. Check logs for provider errors (Anthropic/OpenAI/OpenRouter)
2. Check Redis connectivity
3. Check whether an Ego loop crashed (look for uncaught exception in pino log)
4. Restart: `docker compose restart kairos-cognition`
5. Active sessions may show "Kairos is reconnecting..." — expected during restart

### Vault Unreachable

Severity: **critical**. All tool calls needing credentials will fail.

1. `docker compose ps kairos-vault` — running?
2. `docker compose logs --tail=100 kairos-vault`
3. Common cause: master key mount missing/unreadable on VPS (check `/run/secrets/master.key` on host)
4. If key is missing: bring it from offline backup
5. Restart vault: `docker compose restart kairos-vault`
6. Verify: `docker compose exec kairos-control-plane curl -fsS http://kairos-vault:9000/vault/health`

### Approval Channel Failure

If users report approvals not arriving:

1. Check `approvals` table: `SELECT * FROM approvals WHERE state='PENDING' ORDER BY created_at DESC LIMIT 20;`
2. Check Redis pub/sub: `redis-cli -h kairos-redis PUBSUB CHANNELS 'approval:*'`
3. Check email outbound: SMTP logs in control-plane
4. Test WS delivery from the frontend Trace tab (manual approval creation for a dev tool)
5. Fallback: users can resolve manually via `POST /approvals/:id/resolve` through the API

### Postgres Disk Full

1. Identify: `docker compose exec kairos-postgres df -h /var/lib/postgresql/data`
2. Most likely: `spans` partitions not dropping; `audit_events` growing; MinIO backups filling local disk
3. Emergency: drop oldest `spans` partition (`DROP TABLE spans_YYYY_MM_DD`)
4. Root cause: check partition manager job, archive retention job

### Cloudflare Tunnel Down

1. `docker compose ps cloudflared-vps0` (in the infra stack)
2. Logs: `docker logs cloudflared-vps0 --tail=100`
3. Common cause: CF credential rotation or tunnel ID mismatch
4. Dashboard: https://one.dash.cloudflare.com → Access → Tunnels
5. Restart: `docker compose restart cloudflared-vps0`

### Self-State Corruption

Rare. Symptoms: Ego acts inconsistently, briefing text is malformed, JSON shadow fails validation.

1. Identify: `SELECT version, created_at FROM self_state_snapshots WHERE workspace_id=? ORDER BY version DESC LIMIT 5;`
2. Read the MD: `\x` then `\pset format unaligned` then SELECT markdown.
3. Identify last known-good version
4. Restore: `INSERT INTO self_state_snapshots (workspace_id, version, markdown, shadow_json, triggered_by) SELECT workspace_id, MAX(version)+1, markdown, shadow_json, 'manual_rollback' FROM self_state_snapshots WHERE workspace_id=? AND version=GOOD_VERSION;`
5. Audit: insert `self_modification.rollback` event with explanation
6. Next Ego pass will read the restored state

### Model Provider Outage

1. Check which provider is failing (logs: look for `ProviderUnavailable`)
2. Failover should kick in automatically; verify via cost telemetry that traffic moved to fallback
3. If failover chain is exhausted: disable affected agent roles via workspace settings, notify users
4. Monitor provider status page; re-enable once recovered

## Routine Maintenance

### Daily
- Check `GET /api/v1/health/ready` (external monitoring ping)
- Review any `audit_events` with `category='self_modification'` from the last 24h

### Weekly
- Review cost summary for anomalies
- Review PENDING approvals older than 48h
- Run `VACUUM ANALYZE` on memory_entries if query times climb

### Monthly
- Dependency audit (`pnpm audit`, `uv pip list --outdated`)
- Approval of credential rotations due in next 30 days
- Backup restore drill (every 3 months — see backup-restore.md)

## Backup Schedule

See [backup-restore.md](backup-restore.md).

- Postgres: pg_dump nightly to MinIO
- MinIO: replicate to secondary bucket weekly
- Vault: encrypted volume snapshot nightly; master key backup is offline and manual

## Incident Template

New incidents land as `docs/operations/incidents/YYYY-MM-DD-slug.md`:

```markdown
# Incident: <title>

Date: YYYY-MM-DD HH:MM UTC → end
Severity: S0 | S1 | S2 | S3

## Summary
...

## Timeline
- HH:MM — detected
- HH:MM — mitigated
- HH:MM — resolved

## Root Cause
...

## Impact
Users affected, duration, data loss?

## Resolution
...

## Follow-ups
- [ ] code fix
- [ ] runbook update
- [ ] test added
```
