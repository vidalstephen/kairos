import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Layer2State20260424000005 implements MigrationInterface {
  public readonly name = 'Layer2State20260424000005';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE capabilities (
        id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        name            TEXT         NOT NULL,
        version         TEXT,
        install_hash    TEXT,
        blast_radius    blast_radius NOT NULL DEFAULT 'read',
        approved_domains TEXT[]      NOT NULL DEFAULT '{}',
        installed_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        approved_by     TEXT         NOT NULL,
        review_date     TIMESTAMPTZ,
        status          TEXT         NOT NULL DEFAULT 'active'
      );
    `);

    await queryRunner.query(`
      CREATE TABLE personas (
        id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id UUID        REFERENCES workspaces(id),
        name         TEXT        NOT NULL,
        markdown     TEXT        NOT NULL,
        version      INTEGER     NOT NULL DEFAULT 1,
        active       BOOLEAN     NOT NULL DEFAULT true,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX idx_personas_workspace_id ON personas(workspace_id);
    `);

    await queryRunner.query(`
      CREATE TABLE persona_versions (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        persona_id UUID        NOT NULL REFERENCES personas(id) ON DELETE CASCADE,
        version    INTEGER     NOT NULL,
        markdown   TEXT        NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (persona_id, version)
      );
      CREATE INDEX idx_persona_versions_persona_id ON persona_versions(persona_id);
    `);

    await queryRunner.query(`
      CREATE TABLE agents (
        id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        name         TEXT        NOT NULL,
        workspace_id UUID        REFERENCES workspaces(id),
        config       JSONB       NOT NULL DEFAULT '{}',
        created_by   TEXT        NOT NULL DEFAULT 'kairos',
        version      INTEGER     NOT NULL DEFAULT 1,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX idx_agents_workspace_id ON agents(workspace_id);
    `);

    await queryRunner.query(`
      CREATE TABLE skills (
        id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        name       TEXT        UNIQUE,
        markdown   TEXT        NOT NULL,
        source     TEXT        NOT NULL DEFAULT 'core',
        version    INTEGER     NOT NULL DEFAULT 1,
        enabled    BOOLEAN     NOT NULL DEFAULT true,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE themes (
        id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        name         TEXT        NOT NULL,
        spec         JSONB       NOT NULL DEFAULT '{}',
        generated_by TEXT        NOT NULL DEFAULT 'kairos',
        based_on     TEXT,
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE TABLE policy_rules (
        id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id     UUID         REFERENCES workspaces(id),
        tool_name        TEXT         NOT NULL,
        endpoint_pattern TEXT,
        blast_radius     blast_radius NOT NULL,
        auto_approve     BOOLEAN      NOT NULL DEFAULT false,
        expires_at       TIMESTAMPTZ,
        created_by       UUID         REFERENCES users(id),
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      );
      CREATE INDEX idx_policy_rules_workspace_id ON policy_rules(workspace_id);
    `);

    await queryRunner.query(`
      CREATE TABLE mode_definitions (
        id                        UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id              UUID         REFERENCES workspaces(id),
        mode                      session_mode NOT NULL,
        system_prompt_addition    TEXT,
        allowed_tool_tiers        TEXT[]       NOT NULL DEFAULT '{}',
        auto_transition_triggers  JSONB        NOT NULL DEFAULT '{}',
        created_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at                TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        UNIQUE (workspace_id, mode)
      );
      CREATE INDEX idx_mode_definitions_workspace_id ON mode_definitions(workspace_id);
    `);

    // Add deferred FKs now that agents and personas exist
    await queryRunner.query(`
      ALTER TABLE sessions
        ADD CONSTRAINT fk_sessions_agent_id
          FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL;

      ALTER TABLE sessions
        ADD CONSTRAINT fk_sessions_persona_id
          FOREIGN KEY (persona_id) REFERENCES personas(id) ON DELETE SET NULL;

      ALTER TABLE workspaces
        ADD CONSTRAINT fk_workspaces_default_agent_id
          FOREIGN KEY (default_agent_id) REFERENCES agents(id) ON DELETE SET NULL;
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE workspaces  DROP CONSTRAINT IF EXISTS fk_workspaces_default_agent_id;
      ALTER TABLE sessions    DROP CONSTRAINT IF EXISTS fk_sessions_persona_id;
      ALTER TABLE sessions    DROP CONSTRAINT IF EXISTS fk_sessions_agent_id;
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS mode_definitions;
      DROP TABLE IF EXISTS policy_rules;
      DROP TABLE IF EXISTS themes;
      DROP TABLE IF EXISTS skills;
      DROP TABLE IF EXISTS agents;
      DROP TABLE IF EXISTS persona_versions;
      DROP TABLE IF EXISTS personas;
      DROP TABLE IF EXISTS capabilities;
    `);
  }
}
