import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema20260424000001 implements MigrationInterface {
  public readonly name = 'InitialSchema20260424000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE EXTENSION IF NOT EXISTS citext;
      CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
    `);

    await queryRunner.query(`
      CREATE TYPE user_role AS ENUM ('OWNER', 'ADMIN', 'OPERATOR', 'VIEWER');
      CREATE TYPE member_role AS ENUM ('OWNER', 'ADMIN', 'OPERATOR', 'VIEWER');
      CREATE TYPE session_status AS ENUM ('ACTIVE', 'IDLE', 'CLOSED', 'EXPIRED');
      CREATE TYPE session_mode AS ENUM ('design', 'execution', 'research', 'review', 'idle');
      CREATE TYPE message_role AS ENUM ('user', 'assistant', 'system', 'tool');
      CREATE TYPE run_status AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED', 'TIMED_OUT');
    `);

    await queryRunner.query(`
      CREATE TABLE users (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        email       CITEXT      UNIQUE NOT NULL,
        password_hash TEXT      NOT NULL,
        display_name TEXT,
        role        user_role   NOT NULL DEFAULT 'VIEWER',
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE refresh_tokens (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash TEXT        NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        revoked_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX idx_refresh_tokens_user_id   ON refresh_tokens(user_id);
      CREATE INDEX idx_refresh_tokens_token_hash ON refresh_tokens(token_hash);
    `);

    await queryRunner.query(`
      CREATE TABLE workspaces (
        id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        name            TEXT        NOT NULL,
        description     TEXT,
        settings        JSONB       NOT NULL DEFAULT '{}',
        default_agent_id UUID,
        created_by      UUID        NOT NULL REFERENCES users(id),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_at      TIMESTAMPTZ
      );
      CREATE INDEX idx_workspaces_created_by ON workspaces(created_by);
    `);

    await queryRunner.query(`
      CREATE TABLE workspace_members (
        workspace_id UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id      UUID        NOT NULL REFERENCES users(id)      ON DELETE CASCADE,
        role         member_role NOT NULL DEFAULT 'VIEWER',
        added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (workspace_id, user_id)
      );
      CREATE INDEX idx_workspace_members_user_id ON workspace_members(user_id);
    `);

    await queryRunner.query(`
      CREATE TABLE sessions (
        id                    UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id          UUID           NOT NULL REFERENCES workspaces(id),
        user_id               UUID           NOT NULL REFERENCES users(id),
        status                session_status NOT NULL DEFAULT 'ACTIVE',
        agent_id              UUID,
        persona_id            UUID,
        mode                  session_mode   NOT NULL DEFAULT 'idle',
        presence_last_ping_at TIMESTAMPTZ,
        metadata              JSONB          NOT NULL DEFAULT '{}',
        started_at            TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
        ended_at              TIMESTAMPTZ
      );
      CREATE INDEX idx_sessions_workspace_id ON sessions(workspace_id);
      CREATE INDEX idx_sessions_user_id      ON sessions(user_id);
      CREATE INDEX idx_sessions_status       ON sessions(status);
    `);

    await queryRunner.query(`
      CREATE TABLE messages (
        id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id   UUID         NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        role         message_role NOT NULL,
        content      TEXT         NOT NULL,
        model_id     TEXT,
        tool_calls   JSONB,
        tool_call_id UUID,
        metadata     JSONB        NOT NULL DEFAULT '{}',
        created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX idx_messages_session_id ON messages(session_id);
      CREATE INDEX idx_messages_created_at ON messages(created_at);
    `);

    await queryRunner.query(`
      CREATE TABLE runs (
        id             UUID       PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id     UUID       NOT NULL REFERENCES sessions(id),
        parent_run_id  UUID       REFERENCES runs(id),
        workspace_id   UUID       NOT NULL REFERENCES workspaces(id),
        agent_role     TEXT       NOT NULL,
        model_id       TEXT       NOT NULL,
        status         run_status NOT NULL DEFAULT 'QUEUED',
        tokens_in      INTEGER    NOT NULL DEFAULT 0,
        tokens_out     INTEGER    NOT NULL DEFAULT 0,
        budget_tokens  INTEGER,
        budget_time_ms INTEGER,
        cost_usd       NUMERIC(12,6),
        started_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_at       TIMESTAMPTZ,
        error          JSONB
      );
      CREATE INDEX idx_runs_session_id   ON runs(session_id);
      CREATE INDEX idx_runs_workspace_id ON runs(workspace_id);
      CREATE INDEX idx_runs_status       ON runs(status);
    `);

    await queryRunner.query(`
      CREATE TABLE run_traces (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        run_id     UUID        NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
        event_type TEXT        NOT NULL,
        payload    JSONB       NOT NULL DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX idx_run_traces_run_id ON run_traces(run_id);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS run_traces;
      DROP TABLE IF EXISTS runs;
      DROP TABLE IF EXISTS messages;
      DROP TABLE IF EXISTS sessions;
      DROP TABLE IF EXISTS workspace_members;
      DROP TABLE IF EXISTS workspaces;
      DROP TABLE IF EXISTS refresh_tokens;
      DROP TABLE IF EXISTS users;
      DROP TYPE IF EXISTS run_status;
      DROP TYPE IF EXISTS message_role;
      DROP TYPE IF EXISTS session_mode;
      DROP TYPE IF EXISTS session_status;
      DROP TYPE IF EXISTS member_role;
      DROP TYPE IF EXISTS user_role;
    `);
  }
}
