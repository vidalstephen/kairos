import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { RunEntity } from './run.entity.js';

@Entity('run_traces')
export class RunTraceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'run_id' })
  runId!: string;

  @Column({ type: 'text', name: 'event_type' })
  eventType!: string;

  @Column({ type: 'jsonb', default: '{}' })
  payload!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne('RunEntity', (r: RunEntity) => r.traces, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'run_id' })
  run!: RunEntity;
}
