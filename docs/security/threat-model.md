# Threat Model

STRIDE analysis for Kairos. See also: spec §11.

---

## Scope

System under analysis: Kairos in production (Hostinger VPS, Cloudflare Tunnel, single-operator deployment).

Trust boundaries:
1. Internet ↔ Cloudflare Tunnel
2. Frontend container ↔ Control plane
3. Control plane ↔ Cognition
4. Control plane ↔ Vault
5. Control plane ↔ Executor (ephemeral)
6. Executor ↔ External network (via approved domains only)
7. Cognition ↔ Model providers (Anthropic, OpenAI, OpenRouter)

Assets:
- User credentials (email, password hash)
- Workspace data (messages, memory entries, self-state)
- Kairos's own credentials (vault contents)
- Capability tokens
- Audit log
- Self-state document history

---

## STRIDE per Component

### Control Plane

| Threat | Surface | Mitigation |
|---|---|---|
| Spoofing: forged JWT | HTTP/WS auth | HS256 with strong secret from vault; short-lived access tokens (15m); refresh tokens hashed at rest, revocable |
| Tampering: direct DB writes | Postgres | Only service user has write; migration-only DDL; append-only triggers on audit/self_state/approvals |
| Repudiation: denied actions | Runs, approvals | Every state change emits audit event; JWT `jti` on approval webhooks; WS handshake user-pinned |
| Information disclosure: cross-tenant data | Workspace data | RBAC matrix enforced at service layer; queries scoped by workspace_id + membership |
| DoS: runaway runs | Model calls | Token + time budgets per run; per-workspace monthly cap; rate limits on `user.message` |
| Elevation: policy bypass | Tool dispatch | Every tool call requires capability token; executor verifies HMAC; policy engine is the only issuer |

### Cognition

| Threat | Surface | Mitigation |
|---|---|---|
| Prompt injection: user → model | User messages | Re-voicing pipeline strips model instructions embedded in outputs; tool results sanitized before inclusion in context |
| Prompt injection: retrieved content → model | Memory recall | Fragments tagged as data; injection filter on fetched content before inclusion; see [prompt-injection-defense.md](prompt-injection-defense.md) |
| Information disclosure: credentials in prompt | Ego process | Cognition service never resolves vault aliases; only the policy engine does, injecting values after dispatch |
| Tampering: model output modifying policy | Re-voicing | Ego cannot modify approval decisions, policy config, or capability tokens — those are control-plane-owned |

### Vault

| Threat | Surface | Mitigation |
|---|---|---|
| Information disclosure: value leaked | Vault responses | Responses go only to the policy engine (internal network); never to cognition; audit log of every resolve |
| Tampering: stored value altered | Vault storage | age-encrypted at rest; master key on host filesystem outside container image; checksum per entry |
| Spoofing: forged caller | Internal RPC | HMAC signature on every internal request; `X-Internal-Service` + allowlist |

### Executor

| Threat | Surface | Mitigation |
|---|---|---|
| Escape: container breakout | Tool execution | Non-root user (1000:1000), read-only root FS, tmpfs /tmp, no CAP_SYS_ADMIN, seccomp default, AppArmor/SELinux where available |
| Network exfiltration: outbound to anywhere | Tool network | `kairos-sandbox` bridge network, default-deny egress; allowlist domains enforced at egress proxy (Layer 0) |
| Persistent side effects | Filesystem | Ephemeral container, destroyed on completion; only explicit mount points for outputs |
| Resource exhaustion | CPU/RAM | cgroup quotas (CPU 1.0, RAM 1GB by default, configurable per tool) |

### Frontend

| Threat | Surface | Mitigation |
|---|---|---|
| XSS: user-submitted content | Chat content | React default escaping; markdown rendered with sanitization library; CSP header denies inline scripts |
| CSRF: state-changing endpoints | HTTP API | JWT in Authorization header (not cookie); `SameSite=Strict` on refresh cookie if we use one |
| Clickjacking | Any iframe | `X-Frame-Options: DENY` + CSP `frame-ancestors 'none'` |
| Session hijack | Access token | Short TTL (15m), rotated refresh, bound to user-agent fingerprint for anomaly detection (Phase 5+) |

### Ingress (Cloudflare Tunnel)

| Threat | Surface | Mitigation |
|---|---|---|
| Direct-IP access bypass | VPS public IP | Host firewall blocks inbound 80/443 (only CF Tunnel reaches frontend via internal docker network) |
| DDoS | Public endpoint | Cloudflare edge protection |
| TLS downgrade | Client-to-CF | Cloudflare full-strict TLS; HSTS headers |

---

## Cross-Cutting Concerns

### Input Validation

All external inputs validated at two layers:
- HTTP: Zod schema per endpoint (control plane)
- WS: Zod schema per event (control plane)
- Tool params: manifest-declared schema enforced at policy engine
- Tool results: size limit + structural validation before re-voicing

### Output Sanitization

Tool results sanitized before entering:
- Memory (WritePolicyService: PII + credential regex)
- Self-state (no tool results go here directly)
- LLM context (re-voicing pipeline)

### Secrets Management

Alias-only resolution everywhere. See [credential-vault.md](credential-vault.md). Audit every resolve.

### Dependency Risk

- Dependabot auto-PRs for minor/patch
- Weekly `npm audit` + `pip-audit` in CI
- Scheduled `docker scan` on built images
- SBOM generation in CI

### Defense in Depth

- **Ingress**: CF edge + no exposed ports
- **Auth**: JWT + refresh with revocation
- **Policy**: blast radius + approval + capability token
- **Sandbox**: container + egress allowlist + resource quota
- **Audit**: append-only, no-delete trigger
- **Observability**: every safety-relevant decision traced

---

## Incident Response

See [docs/operations/runbook.md](../operations/runbook.md).

Key playbooks:
1. Vault suspected compromise → rotate master key, re-encrypt, rotate all aliases
2. Model provider key leaked → `POST /internal/vault/rotate` for that alias + upstream rotation
3. Approval bypass suspected → audit review, capability_token revocation, forensic export
4. Self-state corruption → roll back to prior snapshot; investigate root cause before next write

---

## Out of Scope (V1)

- Multi-tenant hard isolation (single-operator deployment)
- Sophisticated DDoS absorption (Cloudflare handles it)
- Hardware-rooted attestation (would need TPM; not in target environment)
- Formal verification of policy engine (tests + reviews instead)
