import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { AuditCategory } from '../database/enums.js';
import type { RunEntity } from './run.entity.js';
import type { SessionEntity } from './session.entity.js';
import type { UserEntity } from './user.entity.js';
import type { WorkspaceEntity } from './workspace.entity.js';

@Entity('audit_events')
export class AuditEventEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: AuditCategory })
  category!: AuditCategory;

  @Column({ type: 'text', name: 'event_type' })
  eventType!: string;

  @Column({ type: 'uuid', name: 'user_id', nullable: true })
  userId!: string | null;

  @Column({ type: 'uuid', name: 'workspace_id', nullable: true })
  workspaceId!: string | null;

  @Column({ type: 'uuid', name: 'session_id', nullable: true })
  sessionId!: string | null;

  @Column({ type: 'uuid', name: 'run_id', nullable: true })
  runId!: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  details!: Record<string, unknown>;

  @Column({ type: 'text', name: 'request_id', nullable: true })
  requestId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne('UserEntity', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity | null;

  @ManyToOne('WorkspaceEntity', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: WorkspaceEntity | null;

  @ManyToOne('SessionEntity', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'session_id' })
  session!: SessionEntity | null;

  @ManyToOne('RunEntity', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'run_id' })
  run!: RunEntity | null;
}
