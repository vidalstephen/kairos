import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { SessionEntity } from './session.entity.js';
import type { WorkspaceEntity } from './workspace.entity.js';

@Entity('self_state_snapshots')
export class SelfStateSnapshotEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id', nullable: true })
  workspaceId!: string | null;

  @Column({ type: 'uuid', name: 'session_id', nullable: true })
  sessionId!: string | null;

  @Column({ type: 'integer' })
  version!: number;

  @Column({ type: 'text' })
  markdown!: string;

  @Column({ type: 'jsonb', name: 'shadow_json', default: '{}' })
  shadowJson!: Record<string, unknown>;

  @Column({ type: 'text', name: 'triggered_by' })
  triggeredBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne('WorkspaceEntity', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: WorkspaceEntity | null;

  @ManyToOne('SessionEntity', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'session_id' })
  session!: SessionEntity | null;
}
