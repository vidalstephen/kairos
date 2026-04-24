import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Memory20260424000003 implements MigrationInterface {
  public readonly name = 'Memory20260424000003';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS vector;`);

    await queryRunner.query(`
      CREATE TYPE memory_scope AS ENUM ('hot', 'warm', 'cold', 'global');
      CREATE TYPE sensitivity_level AS ENUM ('public', 'internal', 'confidential', 'secret');
      CREATE TYPE memory_approval_state AS ENUM ('auto', 'pending', 'approved', 'rejected');
    `);

    await queryRunner.query(`
      CREATE TABLE memory_entries (
        id             UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
        workspace_id   UUID                  NOT NULL REFERENCES workspaces(id),
        session_id     UUID                  REFERENCES sessions(id),
        scope          memory_scope          NOT NULL DEFAULT 'warm',
        sensitivity    sensitivity_level     NOT NULL DEFAULT 'internal',
        approval_state memory_approval_state NOT NULL DEFAULT 'auto',
        source_type    TEXT                  NOT NULL,
        content        TEXT                  NOT NULL,
        fts_vector     TSVECTOR GENERATED ALWAYS AS (to_tsvector('english', content)) STORED,
        embedding      VECTOR(1536),
        metadata       JSONB                 NOT NULL DEFAULT '{}',
        expires_at     TIMESTAMPTZ,
        created_at     TIMESTAMPTZ           NOT NULL DEFAULT NOW()
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_memory_workspace_scope
        ON memory_entries(workspace_id, scope, created_at DESC);
      CREATE INDEX idx_memory_fts
        ON memory_entries USING GIN(fts_vector);
      CREATE INDEX idx_memory_embedding
        ON memory_entries USING hnsw(embedding vector_cosine_ops);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS memory_entries;
      DROP TYPE IF EXISTS memory_approval_state;
      DROP TYPE IF EXISTS sensitivity_level;
      DROP TYPE IF EXISTS memory_scope;
    `);
  }
}
