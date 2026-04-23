# Backup & Restore

Nightly. Restore-tested quarterly.

---

## What We Back Up

| Component | Mechanism | Frequency | Target | Retention |
|---|---|---|---|---|
| Postgres | pg_dump (custom format, compressed) | Nightly 02:00 UTC | MinIO `backups/pg/` | 30 daily + 12 monthly |
| Vault volume | tar of `/data` (already encrypted) | Nightly 02:30 UTC | MinIO `backups/vault/` | 30 daily + 12 monthly |
| MinIO buckets | bucket replication | Weekly | Secondary bucket | permanent |
| Master key | Offline manual | On change | Removable media + secure offline store | permanent (all versions) |
| Redis | no backup (ephemeral state) | — | — | — |

## Postgres Backup

Script: `scripts/backup/pg-backup.sh`

```bash
#!/bin/bash
set -euo pipefail
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
docker compose exec -T kairos-postgres \
  pg_dump -U kairos -d kairos --format=custom --compress=9 \
  > /tmp/kairos-$STAMP.dump
mc cp /tmp/kairos-$STAMP.dump local-minio/backups/pg/
rm /tmp/kairos-$STAMP.dump
```

Scheduled via cron on the VPS. Rotated retention handled by an `mc rm` pass matching age criteria.

Integrity: nightly backups verified with `pg_restore --list` after upload.

## Vault Backup

Script: `scripts/backup/vault-backup.sh`

```bash
docker compose exec -T kairos-vault tar -czf - -C / data > /tmp/vault-$STAMP.tar.gz
mc cp /tmp/vault-$STAMP.tar.gz local-minio/backups/vault/
rm /tmp/vault-$STAMP.tar.gz
```

The tar contents are already encrypted with age; no further protection needed on transit. Backups are useless without the master key.

## MinIO Replication

Secondary bucket on a different cloud target (configured offline; not in repo). Weekly `mc mirror` job.

## Master Key Backup

**Not automated.** On master key creation and every rotation:

1. Copy `master.key.<version>` to an encrypted USB drive
2. Store at two physical locations (operator's safe + off-site)
3. Record the SHA-256 of the file in a separate key inventory document
4. Test read from one copy quarterly

Loss of the master key means permanent loss of the vault contents.

## Restore — Postgres

```bash
# Stop control-plane and cognition so no new writes land
docker compose stop kairos-control-plane kairos-cognition

# Pull the chosen backup
mc cp local-minio/backups/pg/kairos-YYYYMMDDTHHMMSSZ.dump /tmp/

# Drop and recreate (CONFIRM TARGET!)
docker compose exec kairos-postgres psql -U postgres -c "DROP DATABASE kairos;"
docker compose exec kairos-postgres psql -U postgres -c "CREATE DATABASE kairos OWNER kairos;"

# Restore
docker compose exec -T kairos-postgres pg_restore -U kairos -d kairos --no-owner < /tmp/kairos-....dump

# Start services
docker compose start kairos-control-plane kairos-cognition
```

Verify: `curl https://kairos.vectorhost.net/api/v1/health/ready` then a basic session exchange.

## Restore — Vault

```bash
docker compose stop kairos-vault
mc cp local-minio/backups/vault/vault-YYYY....tar.gz /tmp/
# Empty the volume first
docker volume rm kairos_kairos-vault-data
docker volume create kairos_kairos-vault-data

# Untar into a temp container
docker run --rm -v kairos_kairos-vault-data:/data -v /tmp:/host alpine \
  sh -c "cd / && tar -xzf /host/vault-....tar.gz"

# Make sure master key is in place on host at /run/secrets/master.key
docker compose up -d kairos-vault

# Verify
docker compose exec kairos-control-plane curl -fsS http://kairos-vault:9000/vault/health
```

## Disaster Recovery Scenarios

### DR-1: VPS Total Loss

1. Provision new VPS
2. Install Docker + Compose
3. Clone repo, populate `.env`
4. Restore Postgres backup → MinIO bucket → vault volume
5. Copy master key from offline storage to `/run/secrets/master.key`
6. Bring up stack
7. Update Cloudflare Tunnel to point at new VPS (new cloudflared container, same tunnel ID may be reused or a new one created)
8. Smoke test

RTO target: 4 hours with materials available.
RPO target: 24 hours (nightly backups).

### DR-2: Data Corruption (Postgres)

1. Identify last known-good backup (before corruption timestamp)
2. Run Restore — Postgres procedure
3. Any data written after the backup is lost; audit events identify what was done
4. Notify users

### DR-3: Master Key Compromise

1. Rotate master key (see [credential-rotation.md](credential-rotation.md))
2. Rotate every alias
3. Forensic audit of `credential_access_log`
4. Incident doc

### DR-4: Master Key Loss

Vault contents are unrecoverable. This is why we keep multiple offline copies.

If it happens:
1. Provision new vault with new master key
2. Re-enter every external credential manually (provider keys, GitHub PAT, SMTP credentials)
3. Generate new values for every internal credential (JWT secrets, HMAC keys, Postgres password) and propagate
4. Sessions in flight will fail; users re-authenticate
5. Workspace data in Postgres is untouched (different backup path)

## Quarterly Restore Drill

Every 3 months:
1. Spin up a throwaway environment (local docker or scratch VPS)
2. Restore latest Postgres + vault backups
3. Bring up services against restored data
4. Verify health + basic flows
5. Document drill result in `docs/operations/drills/YYYY-MM-DD.md`
6. Fix any gaps found

## Non-Goals

- Point-in-time recovery (would need WAL archiving; Phase 6+)
- Streaming replication (single-node deployment)
- Zero-RPO (cost disproportionate at this scale)
