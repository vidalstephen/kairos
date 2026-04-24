import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ToolsApprovalsAudit20260424000002 implements MigrationInterface {
  public readonly name = 'ToolsApprovalsAudit20260424000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE blast_radius AS ENUM (
        'read', 'write_local', 'install',
        'stateful_external', 'destructive', 'network_egress_new'
      );
      CREATE TYPE tool_tier AS ENUM ('T0', 'T1', 'T2', 'T3');
      CREATE TYPE tool_exec_status AS ENUM ('PENDING', 'EXECUTING', 'COMPLETED', 'FAILED', 'REJECTED');
      CREATE TYPE approval_state_machine AS ENUM ('PENDING', 'APPROVED', 'DENIED', 'EXPIRED');
      CREATE TYPE audit_category AS ENUM (
        'auth', 'run', 'tool', 'memory', 'policy',
        'approval', 'system', 'self_modification'
      );
    `);

    await queryRunner.query(`
      CREATE TABLE tool_registry (
        id         UUID      PRIMARY KEY DEFAULT gen_random_uuid(),
        name       TEXT      UNIQUE NOT NULL,
        version    TEXT      NOT NULL,
        manifest   JSONB     NOT NULL DEFAULT '{}',
        tier       tool_tier NOT NULL DEFAULT 'T3',
        enabled    BOOLEAN   NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT tool_registry_name_fmt CHECK (name ~ '^[a-z][a-z0-9_]*$')
      );
    `);

    await queryRunner.query(`
      CREATE TABLE tool_executions (
        id                      UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id                  UUID             NOT NULL REFERENCES runs(id),
        tool_id                 UUID             NOT NULL REFERENCES tool_registry(id),
        capability_token        TEXT             NOT NULL,
        params                  JSONB            NOT NULL DEFAULT '{}',
        result                  JSONB,
        status                  tool_exec_status NOT NULL DEFAULT 'PENDING',
        blast_radius            blast_radius     NOT NULL,
        approved_via            TEXT             NOT NULL,
        duration_ms             INTEGER,
        network_domains_accessed TEXT[]          NOT NULL DEFAULT '{}',
        exit_code               INTEGER,
        created_at              TIMESTAMPTZ      NOT NULL DEFAULT NOW(),
        completed_at            TIMESTAMPTZ
      );
      CREATE INDEX idx_tool_executions_run_id  ON tool_executions(run_id);
      CREATE INDEX idx_tool_executions_tool_id ON tool_executions(tool_id);
    `);

    await queryRunner.query(`
      CREATE TABLE approvals (
        id                       UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id                   UUID                    REFERENCES runs(id),
        session_id               UUID                    REFERENCES sessions(id),
        state                    approval_state_machine  NOT NULL DEFAULT 'PENDING',
        description              TEXT                    NOT NULL,
        blast_radius             blast_radius            NOT NULL,
        channels_notified        TEXT[]                  NOT NULL DEFAULT '{}',
        resolved_via             TEXT,
        resolved_at              TIMESTAMPTZ,
        resolved_by              UUID                    REFERENCES users(id),
        webhook_token_jti        UUID                    UNIQUE NOT NULL DEFAULT gen_random_uuid(),
        webhook_token_expires_at TIMESTAMPTZ             NOT NULL,
        chat_notification_id     TEXT,
        created_at               TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
        expires_at               TIMESTAMPTZ             NOT NULL
      );
      CREATE INDEX idx_approvals_run_id     ON approvals(run_id);
      CREATE INDEX idx_approvals_session_id ON approvals(session_id);
      CREATE INDEX idx_approvals_state      ON approvals(state);
    `);

    await queryRunner.query(`
      CREATE TABLE revoked_tokens (
        jti        UUID        PRIMARY KEY,
        revoked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE audit_events (
        id           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
        category     audit_category NOT NULL,
        event_type   TEXT           NOT NULL,
        user_id      UUID           REFERENCES users(id),
        workspace_id UUID           REFERENCES workspaces(id),
        session_id   UUID           REFERENCES sessions(id),
        run_id       UUID           REFERENCES runs(id),
        details      JSONB          NOT NULL DEFAULT '{}',
        request_id   TEXT,
        created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW()
      );
      CREATE INDEX idx_audit_events_category     ON audit_events(category);
      CREATE INDEX idx_audit_events_user_id      ON audit_events(user_id);
      CREATE INDEX idx_audit_events_workspace_id ON audit_events(workspace_id);
      CREATE INDEX idx_audit_events_created_at   ON audit_events(created_at);
    `);

    await queryRunner.query(`
      CREATE TABLE credential_access_log (
        id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        alias             TEXT        NOT NULL,
        caller_service    TEXT        NOT NULL,
        purpose           TEXT        NOT NULL,
        run_id            UUID,
        tool_execution_id UUID        REFERENCES tool_executions(id),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX idx_cal_alias  ON credential_access_log(alias);
      CREATE INDEX idx_cal_run_id ON credential_access_log(run_id);
    `);

    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION prevent_mutation() RETURNS trigger AS $$
      BEGIN
        RAISE EXCEPTION 'Table % is append-only', TG_TABLE_NAME;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER audit_events_no_update
        BEFORE UPDATE ON audit_events
        FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

      CREATE TRIGGER audit_events_no_delete
        BEFORE DELETE ON audit_events
        FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS audit_events_no_delete ON audit_events;
      DROP TRIGGER IF EXISTS audit_events_no_update ON audit_events;
      DROP FUNCTION IF EXISTS prevent_mutation();
      DROP TABLE IF EXISTS credential_access_log;
      DROP TABLE IF EXISTS audit_events;
      DROP TABLE IF EXISTS revoked_tokens;
      DROP TABLE IF EXISTS approvals;
      DROP TABLE IF EXISTS tool_executions;
      DROP TABLE IF EXISTS tool_registry;
      DROP TYPE IF EXISTS audit_category;
      DROP TYPE IF EXISTS approval_state_machine;
      DROP TYPE IF EXISTS tool_exec_status;
      DROP TYPE IF EXISTS tool_tier;
      DROP TYPE IF EXISTS blast_radius;
    `);
  }
}
