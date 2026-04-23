# Database Migrations

Migrations live inside the control-plane service: `services/control-plane/src/database/migrations/`.

This directory holds **infra-level** migrations that don't belong to any single service:
- pgvector extension setup
- initial role + schema grants
- cross-service views (if any)

Run order: infra migrations first (idempotent), then control-plane TypeORM migrations.

Phase 0: empty — the control plane creates the `vector` extension on its first migration.
