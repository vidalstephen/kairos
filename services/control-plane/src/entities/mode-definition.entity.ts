import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { SessionMode } from '../database/enums.js';
import type { WorkspaceEntity } from './workspace.entity.js';

@Entity('mode_definitions')
export class ModeDefinitionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id', nullable: true })
  workspaceId!: string | null;

  @Column({ type: 'enum', enum: SessionMode })
  mode!: SessionMode;

  @Column({ type: 'text', name: 'system_prompt_addition', nullable: true })
  systemPromptAddition!: string | null;

  @Column({ type: 'text', array: true, name: 'allowed_tool_tiers', default: '{}' })
  allowedToolTiers!: string[];

  @Column({ type: 'jsonb', name: 'auto_transition_triggers', default: '{}' })
  autoTransitionTriggers!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToOne('WorkspaceEntity', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: WorkspaceEntity | null;
}
