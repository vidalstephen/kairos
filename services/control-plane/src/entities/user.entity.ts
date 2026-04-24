import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { UserRole } from '../database/enums.js';
import type { RefreshTokenEntity } from './refresh-token.entity.js';
import type { WorkspaceEntity } from './workspace.entity.js';
import type { WorkspaceMemberEntity } from './workspace-member.entity.js';

@Entity('users')
export class UserEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'citext', unique: true })
  email!: string;

  @Column({ type: 'text', name: 'password_hash' })
  passwordHash!: string;

  @Column({ type: 'text', name: 'display_name', nullable: true })
  displayName!: string | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.VIEWER })
  role!: UserRole;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany('RefreshTokenEntity', (rt: RefreshTokenEntity) => rt.user)
  refreshTokens!: RefreshTokenEntity[];

  @OneToMany('WorkspaceEntity', (w: WorkspaceEntity) => w.createdByUser)
  ownedWorkspaces!: WorkspaceEntity[];

  @OneToMany('WorkspaceMemberEntity', (m: WorkspaceMemberEntity) => m.user)
  memberships!: WorkspaceMemberEntity[];
}
