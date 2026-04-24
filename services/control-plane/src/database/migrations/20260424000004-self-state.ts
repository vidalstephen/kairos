import type { MigrationInterface, QueryRunner } from 'typeorm';

export class SelfState20260424000004 implements MigrationInterface {
  public readonly name = 'SelfState20260424000004';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE goal_priority AS ENUM ('critical', 'high', 'normal', 'low');
      CREATE TYPE goal_status   AS ENUM ('active', 'standing', 'paused', 'complete');
    `);

    await queryRunner.query(`
      CREATE TABLE self_state_snapshots (
        id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID        REFERENCES workspaces(id),
        session_id   UUID        REFERENCES sessions(id),
        version      INTEGER     NOT NULL,
        markdown     TEXT        NOT NULL,
        shadow_json  JSONB       NOT NULL DEFAULT '{}',
        triggered_by TEXT        NOT NULL,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (workspace_id, version)
      );
      CREATE INDEX idx_self_state_workspace
        ON self_state_snapshots(workspace_id, version DESC);
    `);

    // prevent_mutation() created in migration 002
    await queryRunner.query(`
      CREATE TRIGGER self_state_no_update
        BEFORE UPDATE ON self_state_snapshots
        FOR EACH ROW EXECUTE FUNCTION prevent_mutation();

      CREATE TRIGGER self_state_no_delete
        BEFORE DELETE ON self_state_snapshots
        FOR EACH ROW EXECUTE FUNCTION prevent_mutation();
    `);

    await queryRunner.query(`
      CREATE TABLE goals (
        id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id   UUID          REFERENCES workspaces(id),
        description    TEXT          NOT NULL,
        priority       goal_priority NOT NULL DEFAULT 'normal',
        status         goal_status   NOT NULL DEFAULT 'active',
        trigger_type   TEXT,
        trigger_config JSONB         NOT NULL DEFAULT '{}',
        last_touched   TIMESTAMPTZ,
        created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      );
      CREATE INDEX idx_goals_workspace_id ON goals(workspace_id);
      CREATE INDEX idx_goals_status       ON goals(status);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS goals;
      DROP TRIGGER IF EXISTS self_state_no_delete ON self_state_snapshots;
      DROP TRIGGER IF EXISTS self_state_no_update ON self_state_snapshots;
      DROP TABLE IF EXISTS self_state_snapshots;
      DROP TYPE IF EXISTS goal_status;
      DROP TYPE IF EXISTS goal_priority;
    `);
  }
}
