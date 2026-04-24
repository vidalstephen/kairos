import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { AgentEntity } from './agent.entity.js';
import type { UserEntity } from './user.entity.js';
import type { WorkspaceMemberEntity } from './workspace-member.entity.js';

@Entity('workspaces')
export class WorkspaceEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  settings!: Record<string, unknown>;

  @Column({ type: 'uuid', name: 'default_agent_id', nullable: true })
  defaultAgentId!: string | null;

  @Column({ type: 'uuid', name: 'created_by' })
  createdBy!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  @ManyToOne('UserEntity', (u: UserEntity) => u.ownedWorkspaces)
  @JoinColumn({ name: 'created_by' })
  createdByUser!: UserEntity;

  @ManyToOne('AgentEntity', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'default_agent_id' })
  defaultAgent!: AgentEntity | null;

  @OneToMany('WorkspaceMemberEntity', (m: WorkspaceMemberEntity) => m.workspace)
  members!: WorkspaceMemberEntity[];
}
