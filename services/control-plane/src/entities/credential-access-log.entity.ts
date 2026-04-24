import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { ToolExecutionEntity } from './tool-execution.entity.js';

@Entity('credential_access_log')
export class CredentialAccessLogEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  alias!: string;

  @Column({ type: 'text', name: 'caller_service' })
  callerService!: string;

  @Column({ type: 'text' })
  purpose!: string;

  @Column({ type: 'uuid', name: 'run_id', nullable: true })
  runId!: string | null;

  @Column({ type: 'uuid', name: 'tool_execution_id', nullable: true })
  toolExecutionId!: string | null;

  @Column({ type: 'text', name: 'access_id', nullable: true })
  accessId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne('ToolExecutionEntity', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'tool_execution_id' })
  toolExecution!: ToolExecutionEntity | null;
}
