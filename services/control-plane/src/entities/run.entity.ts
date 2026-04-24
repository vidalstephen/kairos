import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { RunStatus } from '../database/enums.js';
import type { RunTraceEntity } from './run-trace.entity.js';
import type { SessionEntity } from './session.entity.js';
import type { WorkspaceEntity } from './workspace.entity.js';

@Entity('runs')
export class RunEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'session_id' })
  sessionId!: string;

  @Column({ type: 'uuid', name: 'parent_run_id', nullable: true })
  parentRunId!: string | null;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId!: string;

  @Column({ type: 'text', name: 'agent_role' })
  agentRole!: string;

  @Column({ type: 'text', name: 'model_id' })
  modelId!: string;

  @Column({ type: 'enum', enum: RunStatus, default: RunStatus.QUEUED })
  status!: RunStatus;

  @Column({ type: 'integer', name: 'tokens_in', default: 0 })
  tokensIn!: number;

  @Column({ type: 'integer', name: 'tokens_out', default: 0 })
  tokensOut!: number;

  @Column({ type: 'integer', name: 'budget_tokens', nullable: true })
  budgetTokens!: number | null;

  @Column({ type: 'integer', name: 'budget_time_ms', nullable: true })
  budgetTimeMs!: number | null;

  @Column({ type: 'numeric', name: 'cost_usd', precision: 12, scale: 6, nullable: true })
  costUsd!: string | null;

  @CreateDateColumn({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ type: 'timestamptz', name: 'ended_at', nullable: true })
  endedAt!: Date | null;

  @Column({ type: 'jsonb', nullable: true })
  error!: Record<string, unknown> | null;

  @ManyToOne('SessionEntity', (s: SessionEntity) => s.runs, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'session_id' })
  session!: SessionEntity;

  @ManyToOne('WorkspaceEntity', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: WorkspaceEntity;

  @ManyToOne('RunEntity', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'parent_run_id' })
  parentRun!: RunEntity | null;

  @OneToMany('RunTraceEntity', (rt: RunTraceEntity) => rt.run)
  traces!: RunTraceEntity[];
}
