# Kairos

**A persistent, self-aware AI system with a dedicated Ego layer at the center, not a frontier model.**

Kairos inverts the conventional LLM harness topology: a small, always-on Ego model maintains a continuous sense of self, routes work to ephemeral task models, re-voices every output in its own consistent voice, and runs a proactive loop that surfaces observations without being prompted. Specialist and reasoning models are conscripted as subordinate workers — not the center of gravity.

Kairos operates under its own digital identity (its own email, GitHub account, credentials), keeps the owner's personal accounts structurally isolated, and holds a formal map of what it can and cannot modify about itself as first-class self-knowledge.

---

## Quickstart

Requirements: Docker, pnpm ≥ 8, Node 20, Python 3.12, `uv`.

```bash
git clone <this-repo> kairos
cd kairos
make bootstrap    # install deps, generate schemas, prepare env
cp .env.example .env
# edit .env — set provider keys + vault master
make up           # start all services
make doctor       # verify health
```

Frontend: http://localhost:3000 · Control plane: http://localhost:4000 · Cognition: http://localhost:5000

## Repository Map

```
docs/           Normative architecture + technical specs + ADRs
services/
  control-plane/  NestJS — Layer 0 (policy, vault iface, approval state machine, sessions, audit)
  cognition/      Python — Ego process, model routing, task dispatch, utility workers
  frontend/       Next.js — 3-pane chat UI, briefing view, approval UX
  executor/       Docker image — Tool Execution Lane (sandboxed per-call)
packages/       Shared TypeScript schemas + event types
infra/          Docker Compose, Cloudflare Tunnel refs, migration runner
scripts/        Bootstrap, doctor, seed, credential rotation
```

## Documentation

Start here:
- [Architecture](docs/architecture.md) — full system specification (normative)
- [Product Overview](docs/product-overview.md) — narrative introduction
- [Glossary](docs/glossary.md) — Ego, Stratum, Blast Radius, Layer, etc.
- [AGENTS.md](AGENTS.md) — working rules for AI assistants in this repo

Technical:
- [Data Model](docs/specs/data-model.md) · [HTTP API](docs/specs/api-http.md) · [WebSocket API](docs/specs/api-websocket.md)
- [Ego Runtime](docs/specs/ego-runtime.md) · [Memory](docs/specs/memory-architecture.md) · [Model Routing](docs/specs/model-routing.md)
- [Approval State Machine](docs/specs/approval-state-machine.md) · [Layer Map](docs/specs/layer-map.md)
- [Observability](docs/specs/observability.md) · [Self-State Schema](docs/specs/self-state-schema.md)
- [ADRs](docs/adr/) — architecture decision records (0001–0012)

Security:
- [Threat Model](docs/security/threat-model.md) · [Blast Radius Policy](docs/security/blast-radius-policy.md)
- [Credential Vault](docs/security/credential-vault.md) · [Prompt Injection Defense](docs/security/prompt-injection-defense.md)

Operations:
- [Runbook](docs/operations/runbook.md) · [Deploy](docs/operations/deploy.md)
- [Credential Rotation](docs/operations/credential-rotation.md) · [Backup & Restore](docs/operations/backup-restore.md)
- [Test Strategy](docs/test-strategy.md)

Standards:
- [TypeScript](docs/standards/typescript.md) · [Python](docs/standards/python.md)
- [Commits](docs/standards/commits.md) · [API Design](docs/standards/api-design.md)

## Development Workflow

See [CONTRIBUTING.md](CONTRIBUTING.md). All Kairos-authored work lives on `kairos/*` branches with an attribution block on every PR. See [DEV-CHECKLIST.md](DEV-CHECKLIST.md) for the phased build plan.

## License

MIT — see [LICENSE](LICENSE).
