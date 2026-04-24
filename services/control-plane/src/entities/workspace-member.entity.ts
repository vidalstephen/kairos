import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { MemberRole } from '../database/enums.js';
import type { UserEntity } from './user.entity.js';
import type { WorkspaceEntity } from './workspace.entity.js';

@Entity('workspace_members')
export class WorkspaceMemberEntity {
  @PrimaryColumn({ type: 'uuid', name: 'workspace_id' })
  workspaceId!: string;

  @PrimaryColumn({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'enum', enum: MemberRole, default: MemberRole.VIEWER })
  role!: MemberRole;

  @CreateDateColumn({ name: 'added_at', type: 'timestamptz' })
  addedAt!: Date;

  @ManyToOne('WorkspaceEntity', (w: WorkspaceEntity) => w.members, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: WorkspaceEntity;

  @ManyToOne('UserEntity', (u: UserEntity) => u.memberships, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;
}
