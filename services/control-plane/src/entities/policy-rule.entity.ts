import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { BlastRadius } from '../database/enums.js';
import type { UserEntity } from './user.entity.js';
import type { WorkspaceEntity } from './workspace.entity.js';

@Entity('policy_rules')
export class PolicyRuleEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id', nullable: true })
  workspaceId!: string | null;

  @Column({ type: 'text', name: 'tool_name' })
  toolName!: string;

  @Column({ type: 'text', name: 'endpoint_pattern', nullable: true })
  endpointPattern!: string | null;

  @Column({ type: 'enum', enum: BlastRadius, name: 'blast_radius' })
  blastRadius!: BlastRadius;

  @Column({ type: 'boolean', name: 'auto_approve', default: false })
  autoApprove!: boolean;

  @Column({ type: 'timestamptz', name: 'expires_at', nullable: true })
  expiresAt!: Date | null;

  @Column({ type: 'uuid', name: 'created_by', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne('WorkspaceEntity', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: WorkspaceEntity | null;

  @ManyToOne('UserEntity', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdByUser!: UserEntity | null;
}
