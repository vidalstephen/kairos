# Credential Vault

See [ADR-0005](../adr/0005-credential-vault.md), spec §11.3.

---

## Invariants

1. The raw value of any credential **must not** appear in any LLM inference call.
2. The raw value must not appear in any persistent log.
3. Only the policy engine resolves aliases. Cognition never resolves.
4. Every resolve is audited with `caller_service`, `purpose`, `run_id`, `tool_execution_id`.
5. Master encryption key is on the host filesystem, mounted read-only, outside the repo.

---

## Container

- Image: `kairos-vault:<ver>` (multi-stage, distroless Python base)
- User: non-root (1000:1000)
- Network: `kairos-internal` only; no route to outside
- Volume: `kairos-vault-data` (encrypted files at rest)
- Master key mount: `/run/secrets/master.key` (read-only bind from host file)

## Data Layout

```
/data
 ├── master.key.ref        # symlink or marker; actual key is mounted from host
 ├── aliases.json.age      # encrypted alias → metadata map
 └── values/
      ├── <alias>.age      # encrypted alias value (one file per alias)
      └── ...
```

Values encrypted individually with age. Alias metadata bundle re-encrypted on every mutation.

## API

Network binding: internal network only. No TLS needed within host (localhost + docker network isolation); external path does not exist.

Authentication: HMAC-signed request with shared secret `vault://kairos-vault-auth` bootstrapped at first run. Only the policy engine holds this secret.

```
POST /vault/resolve
  Headers: X-Internal-Service, X-Internal-Signature, X-Request-Id
  Body: { alias, caller, purpose, run_id?, tool_execution_id? }
  Response 200: { resolved, access_id }
  Response 404: { error: "unknown_alias" }
  Response 403: { error: "caller_forbidden" }

POST /vault/metadata
  Body: { alias }
  Response: { alias, description, created_at, rotates_at, scope, last_accessed }

POST /vault/rotate
  Body: { alias, new_value? }     // new_value optional — if omitted, vault generates for generatable kinds
  Response: { rotated_at, new_rotates_at }

GET /vault/aliases
  Response: [{ alias, description, rotates_at, last_accessed }]

POST /vault/store
  Body: { alias, value, metadata: { description, scope, rotation_interval } }
  Response: { stored: true, created_at }

GET /vault/health
  Response: { status: "ok", entries: int, oldest_access_ms: int }
```

The `resolved` field in `/resolve` responses is the raw value. Policy engine injects it into the tool call dispatch payload and never logs it.

---

## Alias Naming

Scheme: `vault://<name>` in configs and code; `<name>` on the wire.

Conventions:
- `kairos-*` for Kairos's own credentials (github-token, smtp-user, smtp-pass, anthropic-key, openai-key, openrouter-key)
- `workspace-<slug>-*` for workspace-scoped credentials
- `user-<id>-*` for user-scoped credentials (future)

## Storage Backend

Plain files under `/data/values/` encrypted with `age`. Atomic writes (tempfile + rename). Integrity check via encoded checksum in age header; mismatch → alert + block resolves.

## Access Control

Caller whitelist per alias (in metadata):
- `kairos-*` aliases: caller must be `control-plane` via policy engine
- Workspace aliases: caller must be `control-plane` with workspace membership check passed upstream

Vault does not re-check workspace membership; it trusts the policy engine's upstream check, which is recorded in the access log for audit.

## Rotation

- Every alias has a `rotation_interval` (default 90 days)
- A rotation worker in control plane wakes daily, queries `/vault/aliases`, and schedules rotations approaching due date
- For rotatable kinds (generatable secrets, some API keys), rotation runs automatically
- For external keys (provider API keys): Kairos prompts the user via initiative surfacing — "Anthropic key rotation due in 7 days. Shall I walk you through generating a new one?"
- Dual-key overlap: `/vault/rotate` supports a grace window where both old and new values resolve; after grace, old value is purged

See [docs/operations/credential-rotation.md](../operations/credential-rotation.md).

## Audit

Every `/vault/resolve` and `/vault/rotate` writes to `credential_access_log` via the control plane (control plane is the gateway; vault returns `access_id` which control plane records).

Log contents:
- `alias` (never the value)
- `caller_service`
- `purpose`
- `run_id`, `tool_execution_id`
- `access_id` (correlation with vault's own internal log)
- `created_at`

Vault also keeps its own internal ring log (size-bounded) for forensics.

## Backup & Restore

- `/data` volume backed up nightly to MinIO (encrypted at rest; backup is already ciphertext)
- Master key backup is **not** in the MinIO backup; it is on a separate host path, optionally on removable media, always offline copy
- Restore procedure in [docs/operations/backup-restore.md](../operations/backup-restore.md)

## Compromise Response

If vault compromise suspected:
1. Stop vault container (cuts all resolves → all tool calls requiring credentials fail safe)
2. Rotate master key on host
3. Decrypt with old key, re-encrypt with new key, restart
4. Rotate every alias (they are now suspect) upstream
5. Audit review of last 90 days of `credential_access_log`

Runbook: [docs/operations/runbook.md](../operations/runbook.md) §Vault Compromise.

## Non-Functional

- p95 resolve latency: <10ms (in-process file read + age decrypt)
- Startup: validates master key, verifies aliases.json.age integrity, fails loudly on mismatch
- Memory: keeps decrypted values only during the resolve call, zeroizes buffer on return
