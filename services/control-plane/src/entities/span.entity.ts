import { Column, Entity, PrimaryColumn } from 'typeorm';
import { SpanType } from '../database/enums.js';

// Spans is a Postgres partitioned table (PARTITION BY RANGE started_at).
// PK is (id, started_at) — required by Postgres for partitioned tables.
// FK to traces is enforced at application level (partitioned tables cannot have FKs referencing them).
@Entity('spans')
export class SpanEntity {
  @PrimaryColumn({ type: 'uuid' })
  id!: string;

  @PrimaryColumn({ type: 'timestamptz', name: 'started_at' })
  startedAt!: Date;

  @Column({ type: 'uuid', name: 'trace_id' })
  traceId!: string;

  @Column({ type: 'uuid', name: 'parent_span_id', nullable: true })
  parentSpanId!: string | null;

  @Column({ type: 'enum', enum: SpanType, name: 'span_type' })
  spanType!: SpanType;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'timestamptz', name: 'ended_at', nullable: true })
  endedAt!: Date | null;

  @Column({ type: 'integer', name: 'duration_ms', nullable: true })
  durationMs!: number | null;

  @Column({ type: 'jsonb', default: '{}' })
  attributes!: Record<string, unknown>;

  @Column({ type: 'text', default: 'ok' })
  status!: string;

  @Column({ type: 'text', name: 'error_message', nullable: true })
  errorMessage!: string | null;
}
