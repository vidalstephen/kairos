# Credential Rotation

Procedural playbook. See also: [credential-vault.md](../security/credential-vault.md), [ADR-0005](../adr/0005-credential-vault.md).

---

## Rotation Policy

| Credential | Default interval | Kind |
|---|---|---|
| JWT access secret | 30d | generatable |
| JWT refresh secret | 90d | generatable |
| Approval webhook HMAC | 90d | generatable |
| Capability token HMAC | 90d | generatable |
| Vault auth secret | 180d | generatable |
| Vault master key | 365d | user-supplied |
| Anthropic API key | 90d | external |
| OpenAI API key | 90d | external |
| OpenRouter API key | 90d | external |
| GitHub PAT | 90d | external |
| SMTP password | 180d | external |
| Postgres password | 180d | internal |
| MinIO keys | 180d | internal |

## Modes

### Automatic (generatable secrets)

1. Rotation scheduler wakes daily (control plane cron)
2. Queries `/vault/aliases` for aliases due within 14 days
3. For each generatable alias:
   - Generate new value (secure random)
   - Call `POST /vault/rotate { alias, new_value }` with grace-window=24h
   - Update in-memory cache in control plane and cognition
4. After 24h grace window: old value purged automatically
5. Emit `credential.rotated` audit event

### Semi-Automatic (internal secrets like Postgres password)

1. Scheduler surfaces an initiative item: "Postgres password rotation due."
2. Operator runs `scripts/rotate-creds.sh postgres`:
   - Script connects to Postgres with old password
   - Generates new password
   - `ALTER USER kairos WITH PASSWORD '<new>'`
   - Writes new password to vault via `/vault/rotate`
   - Restarts control-plane and cognition (they re-read on startup)
3. Verify connectivity; rollback if needed

### Manual (external provider keys)

1. Scheduler surfaces initiative: "Anthropic API key rotation due in 7 days."
2. Operator:
   - Logs into provider console
   - Generates new key
   - Tests with a minimal API call
   - Calls `POST /vault/rotate { alias: "kairos-anthropic-key", new_value: "<new>" }`
   - Revokes old key in provider console after confirming new key works
3. Audit: `credential.rotated` with `mode=manual`

## Master Key Rotation

Highest consequence; requires downtime.

1. Announce maintenance window
2. Stop all Kairos services except vault (cognition and control plane must not be resolving during the switch)
3. On host: generate new master key file → save as `master.key.new`
4. Exec into vault container (or use a one-shot rotation tool):
   - Decrypt every alias with old key
   - Re-encrypt every alias with new key
   - Update `aliases.json.age`
5. Replace the mounted file (`master.key.old` archived offline)
6. Restart vault
7. Verify: `curl http://kairos-vault:9000/vault/health`
8. Test a sample resolve
9. Start control-plane and cognition
10. Smoke-test one tool call needing credentials

Audit: `credential.master_key_rotated` (very rare; requires human-confirmed actor).

## Emergency Rotation (Suspected Compromise)

When any credential is suspected compromised:

1. **Immediate**: stop the relevant service or disable the key at the provider
2. Rotate via the matching procedure above, skipping grace windows where possible
3. Audit review: `SELECT * FROM credential_access_log WHERE alias=? ORDER BY created_at DESC LIMIT 500;`
4. Check for anomalous access patterns
5. File incident doc under `docs/operations/incidents/`

## Grace Windows

The vault supports dual-key resolution for a configured grace period after rotation:

```
POST /vault/rotate
Body: { alias, new_value, grace_window_sec: 86400 }
Response: { rotated_at, new_rotates_at, old_value_expires_at }
```

During grace, `/vault/resolve` returns the **new** value to new callers, but calls already in flight can complete against the old value (control plane tracks start time).

After grace, old value is securely deleted from the encrypted store.

## Rollback

If a rotation breaks service (new key invalid, permission scope wrong, etc.):

- During grace: immediately re-rotate back to old value (still in vault)
- After grace: generate another new value; old is gone; may need to recreate at provider

## Verification Script

`scripts/verify-rotations.sh` — reads all alias metadata, reports:
- `due_within_30d`
- `overdue`
- `recently_rotated (<7d)`

Run weekly via cron; output emailed to operator.

## Post-Rotation Checklist

- [ ] Vault shows new `rotates_at`
- [ ] Control plane and cognition health checks pass
- [ ] One sample tool call using the credential succeeds
- [ ] Audit event present
- [ ] Old key revoked at external provider (for manual rotations)
- [ ] Grace window scheduled to auto-expire
