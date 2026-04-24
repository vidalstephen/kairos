import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BlastRadius, ToolExecStatus } from '../database/enums.js';
import type { RunEntity } from './run.entity.js';
import type { ToolRegistryEntity } from './tool-registry.entity.js';

@Entity('tool_executions')
export class ToolExecutionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'run_id' })
  runId!: string;

  @Column({ type: 'uuid', name: 'tool_id' })
  toolId!: string;

  @Column({ type: 'text', name: 'capability_token' })
  capabilityToken!: string;

  @Column({ type: 'jsonb', default: '{}' })
  params!: Record<string, unknown>;

  @Column({ type: 'jsonb', nullable: true })
  result!: Record<string, unknown> | null;

  @Column({ type: 'enum', enum: ToolExecStatus, default: ToolExecStatus.PENDING })
  status!: ToolExecStatus;

  @Column({ type: 'enum', enum: BlastRadius, name: 'blast_radius' })
  blastRadius!: BlastRadius;

  @Column({ type: 'text', name: 'approved_via' })
  approvedVia!: string;

  @Column({ type: 'integer', name: 'duration_ms', nullable: true })
  durationMs!: number | null;

  @Column({ type: 'text', array: true, name: 'network_domains_accessed', default: '{}' })
  networkDomainsAccessed!: string[];

  @Column({ type: 'integer', name: 'exit_code', nullable: true })
  exitCode!: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', name: 'completed_at', nullable: true })
  completedAt!: Date | null;

  @ManyToOne('RunEntity', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'run_id' })
  run!: RunEntity;

  @ManyToOne('ToolRegistryEntity', (t: ToolRegistryEntity) => t.executions, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'tool_id' })
  tool!: ToolRegistryEntity;
}
