import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { MemoryApprovalState, MemoryScope, SensitivityLevel } from '../database/enums.js';
import type { SessionEntity } from './session.entity.js';
import type { WorkspaceEntity } from './workspace.entity.js';

@Entity('memory_entries')
export class MemoryEntryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId!: string;

  @Column({ type: 'uuid', name: 'session_id', nullable: true })
  sessionId!: string | null;

  @Column({ type: 'enum', enum: MemoryScope, default: MemoryScope.WARM })
  scope!: MemoryScope;

  @Column({ type: 'enum', enum: SensitivityLevel, default: SensitivityLevel.INTERNAL })
  sensitivity!: SensitivityLevel;

  @Column({ type: 'enum', enum: MemoryApprovalState, name: 'approval_state', default: MemoryApprovalState.AUTO })
  approvalState!: MemoryApprovalState;

  @Column({ type: 'text', name: 'source_type' })
  sourceType!: string;

  @Column({ type: 'text' })
  content!: string;

  // fts_vector is a GENERATED column — never written by the ORM
  @Column({ type: 'tsvector', name: 'fts_vector', select: false, insert: false, update: false })
  ftsVector!: string;

  // embedding is a pgvector VECTOR(1536) — queries via raw SQL
  @Column({ type: 'text', name: 'embedding', nullable: true, select: false })
  embedding!: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata!: Record<string, unknown>;

  @Column({ type: 'timestamptz', name: 'expires_at', nullable: true })
  expiresAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne('WorkspaceEntity', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: WorkspaceEntity;

  @ManyToOne('SessionEntity', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'session_id' })
  session!: SessionEntity | null;
}
