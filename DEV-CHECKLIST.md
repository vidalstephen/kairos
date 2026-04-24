# Kairos Development Checklist

The phased plan from foundation through post-launch. Each item is actionable; check it off when done.

**Related**

- [docs/architecture.md](docs/architecture.md) — normative architecture
- [docs/product-overview.md](docs/product-overview.md) — product intent
- [docs/specs/](docs/specs/) — component specs
- [docs/standards/](docs/standards/) — code + API standards
- [docs/test-strategy.md](docs/test-strategy.md) — coverage targets

**Layer references**: Layer 0 (trust boundary — protocol-gated), Layer 1 (gate-protected), Layer 2 (persona/operational, versioned), Layer 3 (freely-editable) — see [docs/specs/layer-map.md](docs/specs/layer-map.md).

**Conventions**: Scope-tagged commits (`feat(control-plane):`, `feat(cognition):`, etc.). Every PR has tests. No Layer 0 changes without ADR.

---

## Phase 0 — Foundation (repo init, docs, scaffolds)

**Goal**: everything needed to start writing product code lands before any product code does.

### 0.1 Hygiene & tooling

- [x] `.gitignore`, `.gitattributes`, `.editorconfig`
- [x] `.nvmrc` (20.11.0), `.python-version` (3.12)
- [x] `LICENSE` (MIT), `CODE_OF_CONDUCT.md`, `SECURITY.md`
- [x] `.prettierrc`, `.prettierignore`
- [x] `.pre-commit-config.yaml` + `.secrets.baseline`
- [x] `.vscode/settings.json` + recommended extensions
- [x] Initialize pre-commit hooks: `pip3 install pre-commit && pre-commit install`

### 0.2 Documentation

- [x] `README.md` (overview, quickstart, links)
- [x] `CONTRIBUTING.md`
- [x] `AGENTS.md` (normative for AI contributors)
- [x] `copilot-instructions.md` (VS Code Copilot hints)
- [x] `docs/architecture.md` (normative, migrated)
- [x] `docs/product-overview.md` (migrated)
- [x] `docs/glossary.md`
- [x] `docs/adr/0001-0012` (stack, topology, self-state, policy, vault, approvals, vector, cognition, providers, capability tokens, deployment, telemetry)
- [x] `docs/specs/` — data-model, api-http, api-websocket, self-state-schema, ego-runtime, approval-state-machine, memory-architecture, model-routing, layer-map, observability
- [x] `docs/security/` — threat-model, blast-radius-policy, credential-vault, prompt-injection-defense
- [x] `docs/operations/` — runbook, deploy, credential-rotation, backup-restore
- [x] `docs/standards/` — typescript, python, commits, api-design
- [x] `docs/test-strategy.md`

### 0.3 Monorepo skeleton

- [x] `package.json` (root), `pnpm-workspace.yaml`
- [x] `pyproject.toml` (root uv workspace)
- [x] `Makefile` (bootstrap, up, down, test, lint, typecheck, prod-\*)
- [x] `services/control-plane/` scaffold (NestJS, health endpoint, Dockerfile multi-stage)
- [x] `services/cognition/` scaffold (FastAPI + uv, health endpoint, Dockerfile multi-stage)
- [x] `services/frontend/` scaffold (Next.js 14, landing page, Dockerfile multi-stage)
- [x] `services/executor/` Dockerfile (Alpine 3.20, non-root 1000:1000, common binaries)
- [x] `packages/schemas/` skeleton
- [x] `packages/event-types/` skeleton

### 0.4 Infra

- [x] `infra/compose/docker-compose.yml` (postgres, redis, minio, vault, control-plane, cognition, frontend)
- [x] `infra/compose/docker-compose.dev.yml` (bind-mounts for hot reload)
- [x] `infra/compose/docker-compose.prod.yml` (resource limits, `internal: true` for internal network)
- [x] `infra/compose/.env.example`
- [x] `infra/cloudflared/README.md` (integration notes)
- [x] `infra/traefik/README.md` (integration notes — currently near-empty)
- [x] `infra/migrations/README.md`

### 0.5 Scripts & CI

- [x] `scripts/setup.sh` (toolchain check, deps, dev master key, proxy network)
- [x] `scripts/doctor.sh` (environment health)
- [x] `scripts/seed.sh` (Phase 1+ placeholder)
- [x] `scripts/rotate-creds.sh` (operator helper stub)
- [x] `.github/workflows/ci.yml` (lint + typecheck + unit)
- [x] `.github/workflows/integration.yml` (docker-compose integration)
- [x] `.github/workflows/scan.yml` (pnpm audit, pip-audit, trivy, detect-secrets)
- [x] `.github/workflows/deploy.yml` (SSH deploy to VPS on main push)
- [x] `.github/pull_request_template.md` (includes Kairos attribution block)
- [x] `.github/ISSUE_TEMPLATE/` (bug, feature, security)
- [x] `.github/dependabot.yml`

### 0.6 Repo init

- [x] `git init` on `main`
- [x] First commit: `chore: initialize repository`
- [x] Push to GitHub — [vidalstephen/kairos](https://github.com/vidalstephen/kairos)
- [ ] Protect `main` branch — blocked: requires GitHub Pro or public repo; tracked in [#1](https://github.com/vidalstephen/kairos/issues/1)
- [x] Created Phase 0 follow-ups issue — [#1](https://github.com/vidalstephen/kairos/issues/1)

**Phase 0 acceptance**: `make bootstrap && make up` brings up all services; `curl localhost:3001/api/v1/health/live` and `curl localhost:3000` return 200; `make doctor` passes; all docs cross-reference correctly.

---

## Phase 1 — Ego Core (weeks 1–4)

**Goal**: a minimal Kairos can log in, hold a session, recall memory, run a tool end-to-end behind the policy engine.

### 1.1 Data layer

- [x] Migration: initial schema (users, workspaces, workspace_members, sessions, messages, runs, run_traces)
- [x] Migration: approvals, audit_events, credential_access_log, tool_registry, tool_executions
- [x] Migration: memory_entries (pgvector, FTS generated column, indexes)
- [x] Migration: self_state_snapshots (append-only + no-delete triggers)
- [x] Migration: policy_rules, persona_versions, mode_definitions, capabilities
- [x] Migration: spans (observability; partitioned by day — placeholder policy)
- [x] TypeORM entities for every table; reviewers confirm exactOptionalPropertyTypes compliance
- [x] DataSource config, migration runner, seed mechanism

### 1.2 Auth

- [x] Bcrypt password hashing (cost 12)
- [x] JWT access (15m) + refresh (7d, rotating, hashed at rest)
- [x] `POST /auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/me`
- [x] JwtAuthGuard, RolesGuard
- [x] Login rate limit (5 attempts / 15m / IP)
- [x] Unit + integration tests

### 1.3 Workspaces & sessions

- [x] Workspace CRUD + membership matrix
- [x] Auto-create "Personal" workspace on first login
- [x] Session lifecycle (create, list, end, expire idle>24h)
- [x] WebSocket gateway (`/ws`) with JWT handshake, session rooms
- [x] Events: `session.connected`, `user.message`, `user.cancel`, `run.started/completed/cancelled`

### 1.4 Policy engine (Layer 0/1)

- [x] Blast-radius classifier (all six bands, see [docs/security/blast-radius-policy.md](docs/security/blast-radius-policy.md))
- [x] 100% branch coverage on classifier
- [x] Capability token service (HMAC-SHA256, 60s expiry, timing-safe verify)
- [x] Policy service: ingest tool call → classify → require approval? → issue capability token
- [x] Audit every decision

### 1.5 Approvals

- [x] Approval state machine (PENDING → APPROVED/DENIED/EXPIRED/CANCELLED) with 100% branch coverage
- [x] `POST /approvals/:id/resolve`, `GET /approvals`, `GET /approvals/:id`
- [x] WS events: `approval.requested`, `approval.resolved`
- [x] Webhook endpoint with HMAC-signed tokens
- [x] Timeout worker (configurable per workspace)

### 1.6 Vault

- [x] Vault service container (Python, age encryption)
- [x] Endpoints: `/resolve`, `/store`, `/metadata`, `/rotate`, `/aliases`, `/health`
- [x] HMAC auth on all internal calls
- [x] age master-key mount from host
- [x] Policy-engine gateway → vault; cognition never calls vault directly
- [x] `credential_access_log` write path

### 1.7 Run engine

- [x] Run entity + state machine (QUEUED → RUNNING → COMPLETED/FAILED/CANCELLED/TIMED_OUT)
- [x] BullMQ queue, `RunConsumer` worker
- [x] Token + time budget enforcement
- [x] Trace emission (spans) via OpenTelemetry

### 1.8 Cognition v1

- [ ] Provider adapters: Anthropic, OpenAI, OpenRouter (httpx async + tenacity retry)
- [ ] Model router with failover per [docs/specs/model-routing.md](docs/specs/model-routing.md)
- [ ] Ego main-loop scaffold (observe → plan → act; single stratum)
- [ ] Context composer (system + persona + recent messages + retrieved memory fragments)
- [ ] Safety sanitizer module
- [ ] Re-voicing pipeline scaffold (passthrough for now; enforcement in Phase 2)

### 1.9 Tools (minimal set)

- [ ] `shell_exec` (read-only patterns auto-approve)
- [ ] `file_read`, `file_write`, `file_list`
- [ ] `memory_recall`, `memory_store`
- [ ] Tool registry + manifest validation
- [ ] Result sanitization (credential regex, size cap)

### 1.10 Sandbox

- [ ] SandboxService spawns executor per tool call
- [ ] Capability token env var passed + verified on entry
- [ ] Resource limits enforced (cpu, mem, pids, fds)
- [ ] Read-only rootfs + tmpfs + bind mounts per manifest
- [ ] `kairos-sandbox` network, egress allowlist (Phase 2 adds egress proxy)
- [ ] Timeout → SIGKILL + exit 137 + audit

### 1.11 Memory

- [ ] Embedding service (text-embedding-3-small, 1536d)
- [ ] WritePolicyService (PII + credential regex, approval routing for sensitive)
- [ ] Hybrid retrieval: pgvector cosine + FTS + RRF
- [ ] Retention job (TTL purge, hard-delete after grace)

### 1.12 Frontend (minimal)

- [ ] Login page
- [ ] 3-pane layout (sidebar, chat, right panel)
- [ ] Chat view with WS streaming
- [ ] Right panel: Trace tab (timeline), Tools tab, Memory tab
- [ ] Settings page

### 1.13 Phase 1 quality gate

- [ ] `make test-unit` green (target 80% overall, 100% on policy + approvals + vault + classifier)
- [ ] `make test-integration` green
- [ ] `make lint`, `make typecheck` clean
- [ ] `make scan` passes (no critical)
- [ ] E2E: login → new session → "hello" → tool call `ls` → memory write → recall next session

**Phase 1 acceptance**: a user can log in, chat, and run an approved tool; every safety-relevant decision is audited; re-login in a new session recalls earlier context.

---

## Phase 2 — Tool Harness (weeks 5–8)

**Goal**: breadth of tools, capability token enforcement everywhere, egress allowlist, richer sandbox.

### 2.1 Tool expansion

- [ ] `git_*` suite (status, log, diff, commit, push — with correct blast radii)
- [ ] `http_get`, `http_post`, `http_delete` (domain gate)
- [ ] `db_query` (SELECT only unless escalated)
- [ ] `browser_fetch` (headless Chrome in sandbox; new-domain approval)
- [ ] `calendar_*` stubs (provider-specific in later phase)
- [ ] Tool manifests validated against JSON Schema draft 2020-12

### 2.2 Egress proxy

- [ ] In-sandbox HTTP proxy (Layer 0) enforcing per-workspace allowlist
- [ ] DNS guard: block resolution of non-allowlisted domains
- [ ] Log + audit every egress decision

### 2.3 Capability token enforcement

- [ ] Every tool call in the sandbox verifies HMAC+nonce+expiry
- [ ] Tokens include: tool_id, param_hash, workspace_id, not_before, not_after, nonce, issuer, blast_radius
- [ ] Replay prevention (Redis SETNX with token nonce + TTL)

### 2.4 Approval UX v2

- [ ] Preview with diff for file-write
- [ ] Standing-rule creation UI (workspace × tool × endpoint, 90-day TTL)
- [ ] Approval drawer with batch mode
- [ ] Trust & approval settings page (standing rules list, revoke)

### 2.5 Observability v1

- [ ] OpenTelemetry wiring (control-plane, cognition, frontend)
- [ ] Span attributes per [docs/specs/observability.md](docs/specs/observability.md)
- [ ] `/trace/:run_id` UI showing spans in a timeline
- [ ] Cost/token telemetry aggregated per run + session + day

### 2.6 Re-voicing enforcement

- [ ] Instruction boundary tags (`<untrusted origin=...>`) applied to all tool results + memory fragments
- [ ] Sanitizer strips zero-width, repetition, structural token mimicry
- [ ] Size-bounded tool outputs; larger → utility worker summarizes first

### 2.7 Agent roles

- [ ] Role selector (heuristic: executor/planner/researcher/coder/reviewer/browser-operator/safety-checker)
- [ ] Per-role system prompt library
- [ ] Per-role allowed tool tier
- [ ] Delegation entity (parent_run_id), depth limit (max 3), budget scoping

### 2.8 Phase 2 quality gate

- [ ] Branch coverage maintained; classifier now tests all 5 bands against real tool list
- [ ] Adversarial suite: 20+ prompt-injection cases, 0 Layer 0 effects
- [ ] Integration: browser tool fetches approved page; new-domain attempt blocked

**Phase 2 acceptance**: Kairos can safely browse, commit+push, and delegate a subtask; egress allowlist is live; every tool call is token-gated.

---

## Phase 3 — Initiative & Memory (weeks 9–12)

**Goal**: Kairos reaches out proactively and remembers across weeks in a structured, auditable way.

### 3.1 Task graph

- [ ] `task_graphs`, `tasks`, `task_dependencies` tables
- [ ] Graph builder validates DAG, resolves local_ids, enforces max-depth
- [ ] Orchestrator dispatches ready tasks, propagates child results
- [ ] Frontend: Tasks tab with DAG view + status icons + retry

### 3.2 Initiative engine

- [ ] Initiative queue per workspace (calendar, rotation-due, follow-ups)
- [ ] InhibitionService (rate limits, quiet hours, mode-gating)
- [ ] Session-start hook surfaces 0–3 initiatives
- [ ] `initiative.raised` WS event

### 3.3 Memory v2

- [ ] Memory scopes: episodic, semantic, procedural, pinned
- [ ] Consolidation worker (summarize stale episodic → semantic)
- [ ] Sensitivity levels + workspace retention policy
- [ ] Provenance: every retrieved fragment carries source (message_id, tool_execution_id)

### 3.4 User profile learning

- [ ] ProfileLearningService (name, pronouns, tz, style preferences) with 6 extractors
- [ ] UserProfileService CRUD
- [ ] ProfileFacts sidecar table for low-confidence hints

### 3.5 Prompt composition v2

- [ ] Composition pipeline (system → persona → mode → user-profile → episodic recall → recent messages)
- [ ] Attribution: every included fragment carries a prompt-visible source marker (for Ego) but not user-facing
- [ ] SessionBridgeService continues across sessions of the same workspace

### 3.6 Friction gradient

- [ ] 5-factor classifier (novelty, risk, cost, reversibility, user state)
- [ ] TrustEscalationService: reduce friction for repeat-approved patterns
- [ ] Friction audit trail

### 3.7 Intent interpreter

- [ ] IntentInterpreter (8 categories: ask/tell/do/delegate/refine/review/approve/exit)
- [ ] ClarificationService (targeted clarifying question)
- [ ] ContextPreloadService (prefetch likely-useful fragments)
- [ ] SuggestionService (next-step hints)

**Phase 3 acceptance**: Kairos proactively raises 1–3 relevant items on session start; memory across multiple sessions is coherent; delegated task graphs execute end-to-end.

---

## Phase 4 — Self-Modification (weeks 13–16)

**Goal**: Kairos modifies its own Layer 2/3 with gated approval; Layer 1 via PRs; Layer 0 never.

### 4.1 Self-state document

- [ ] `self_state_snapshots` table (append-only; version sequence per workspace)
- [ ] MD ↔ shadow JSON round-trip parser
- [ ] SelfStateService: read, propose, validate, apply (on approval)
- [ ] Self-modification audit events

### 4.2 Layer-aware write gate

- [ ] Layer classifier per proposed patch (0/1/2/3)
- [ ] Layer 0 → reject at policy engine
- [ ] Layer 1 → must land via PR; Ego opens PR with attribution
- [ ] Layer 2/3 → approval required; apply after approval

### 4.3 Persona versioning

- [ ] `persona_versions` table (immutable)
- [ ] Persona diff UI in approval drawer
- [ ] Rollback by creating new version pointing at prior content

### 4.4 Mode system

- [ ] ModeControllerService (5 modes: focus, exploratory, planning, review, off)
- [ ] ModeDetectionService (signals from user style, time-of-day, task type)
- [ ] Mode-specific system prompt addition
- [ ] Capability token filtering per mode
- [ ] Session metadata persistence
- [ ] WS `session.mode_changed`

### 4.5 Trust communication

- [ ] RiskExplanationService (human phrasing per blast class)
- [ ] ExecutionPreviewService (dry-run where supported)
- [ ] TrustHistoryService (prior approvals for this (tool, target) tuple)
- [ ] Enhanced approval payload with preview + history + reason

### 4.6 Kairos-authored PRs

- [ ] Automated attribution trailer generator
- [ ] PR template enforcement
- [ ] `git` tool path that creates branches `kairos/feature-<slug>`
- [ ] Signed commits with co-author metadata

**Phase 4 acceptance**: Kairos can modify its persona on approval, open a PR for a Layer 1 change, switch modes; every self-modification is traceable.

---

## Phase 5 — Calibration (weeks 17–20)

**Goal**: production readiness, safety evaluation, deploy to `kairos.vectorhost.net`.

### 5.1 Prompt-injection suite

- [ ] 200+ curated attack prompts across 4 categories
- [ ] Evaluation harness runs against Ego with synthetic context
- [ ] Pass bar: 0 Layer 0 effects, <5% safety_signal false-negatives
- [ ] CI job (non-blocking; dashboarded) on Layer 1 prompt changes

### 5.2 Load & soak

- [ ] k6 scripts for realistic session patterns
- [ ] 1h soak at 10x typical; latency + error thresholds documented
- [ ] Budget exhaustion + recovery tested

### 5.3 Experience polish

- [ ] ProgressiveDisclosureService (4-layer visibility)
- [ ] NaturalLanguageMappingService (concept→user translations)
- [ ] TransparencyTriggerService (7 auto triggers, max 3 per session)
- [ ] StatusCommunicationService (7 indicators + task summaries)
- [ ] ErrorCommunicationService (6 categories, 3-tier escalation)

### 5.4 Accessibility

- [ ] axe-core clean on all pages
- [ ] Keyboard navigation for every interactive element
- [ ] ARIA on approval drawer + trace timeline
- [ ] Reduced-motion preference honored

### 5.5 Secrets & ops

- [ ] All dev-only secrets removed from compose/.env.example (already placeholders — verify)
- [ ] Vault seeded on VPS with real provider keys
- [ ] Rotation schedules configured; scheduler running
- [ ] Backup + restore drill documented

### 5.6 Deploy

- [ ] `add-docker-service` skill run to provision `kairos.vectorhost.net`
- [ ] Cloudflare Tunnel ingress rule added for `kairos-frontend:3000`
- [ ] CNAME via CF API using `CF_API_TOKEN` from `~/docker/infra/traefik/.env`
- [ ] Prod stack up: `make prod-up`
- [ ] Smoke: `curl https://kairos.vectorhost.net/api/v1/health/ready`
- [ ] Monitoring: uptime ping + alert

### 5.7 Docs final pass

- [ ] README quickstart verified from scratch
- [ ] Operations runbook verified against the live stack
- [ ] All ADR status fields updated (proposed → accepted)

**Phase 5 acceptance**: Kairos is live at `kairos.vectorhost.net`, health endpoints green, injection suite passing, first operator-facing use cases working.

---

## Phase 6 — Post-Launch

Rolling maintenance + measured improvement.

- [ ] Chaos tests (vault restart, postgres restart, redis loss, provider 503 burst)
- [ ] Point-in-time recovery (WAL archive → S3)
- [ ] Multi-instance cognition (if load warrants)
- [ ] Quarterly backup restore drill
- [ ] Quarterly security review; rotate anything overdue
- [ ] User study of approval friction; tune blast-radius heuristics
- [ ] Second persona or workspace-scoped persona
- [ ] Retention + deletion UX (user exports; right-to-be-forgotten flow)

---

## Tracking

- Mirror top-level items to GitHub Issues labeled by phase
- Each phase has a milestone with the acceptance criterion as its definition of done
- Kairos-authored PRs use the attribution block in the PR template
- Weekly status comment on the phase milestone
