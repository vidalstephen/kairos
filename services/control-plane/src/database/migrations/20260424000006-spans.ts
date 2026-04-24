import type { MigrationInterface, QueryRunner } from 'typeorm';

export class Spans20260424000006 implements MigrationInterface {
  public readonly name = 'Spans20260424000006';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE span_type AS ENUM (
        'ego_pass', 'task_dispatch', 'tool_call', 'memory_op',
        'approval_event', 'self_modification', 'heartbeat'
      );
    `);

    await queryRunner.query(`
      CREATE TABLE traces (
        id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        session_id  UUID        REFERENCES sessions(id),
        root_span_id UUID,
        started_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        ended_at    TIMESTAMPTZ
      );
      CREATE INDEX idx_traces_session_id ON traces(session_id);
    `);

    // Spans: partitioned by day. Phase 1 ships default partition only;
    // automated partition management is added in Phase 5.
    // Composite PK (id, started_at) is required by Postgres for partitioned tables.
    await queryRunner.query(`
      CREATE TABLE spans (
        id            UUID      NOT NULL,
        trace_id      UUID      NOT NULL,
        parent_span_id UUID,
        span_type     span_type NOT NULL,
        name          TEXT      NOT NULL,
        started_at    TIMESTAMPTZ NOT NULL,
        ended_at      TIMESTAMPTZ,
        duration_ms   INTEGER,
        attributes    JSONB     NOT NULL DEFAULT '{}',
        status        TEXT      NOT NULL DEFAULT 'ok',
        error_message TEXT
      ) PARTITION BY RANGE (started_at);

      CREATE TABLE spans_default PARTITION OF spans DEFAULT;

      ALTER TABLE spans ADD PRIMARY KEY (id, started_at);
      CREATE INDEX idx_spans_trace_id   ON spans(trace_id, started_at);
      CREATE INDEX idx_spans_started_at ON spans(started_at DESC);
    `);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS spans_default;
      DROP TABLE IF EXISTS spans;
      DROP TABLE IF EXISTS traces;
      DROP TYPE IF EXISTS span_type;
    `);
  }
}
