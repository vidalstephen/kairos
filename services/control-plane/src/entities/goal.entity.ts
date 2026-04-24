import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { GoalPriority, GoalStatus } from '../database/enums.js';
import type { WorkspaceEntity } from './workspace.entity.js';

@Entity('goals')
export class GoalEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id', nullable: true })
  workspaceId!: string | null;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'enum', enum: GoalPriority, default: GoalPriority.NORMAL })
  priority!: GoalPriority;

  @Column({ type: 'enum', enum: GoalStatus, default: GoalStatus.ACTIVE })
  status!: GoalStatus;

  @Column({ type: 'text', name: 'trigger_type', nullable: true })
  triggerType!: string | null;

  @Column({ type: 'jsonb', name: 'trigger_config', default: '{}' })
  triggerConfig!: Record<string, unknown>;

  @Column({ type: 'timestamptz', name: 'last_touched', nullable: true })
  lastTouched!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne('WorkspaceEntity', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: WorkspaceEntity | null;
}
