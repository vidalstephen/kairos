import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { SessionMode, SessionStatus } from '../database/enums.js';
import type { AgentEntity } from './agent.entity.js';
import type { MessageEntity } from './message.entity.js';
import type { PersonaEntity } from './persona.entity.js';
import type { RunEntity } from './run.entity.js';
import type { UserEntity } from './user.entity.js';
import type { WorkspaceEntity } from './workspace.entity.js';

@Entity('sessions')
export class SessionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id' })
  workspaceId!: string;

  @Column({ type: 'uuid', name: 'user_id' })
  userId!: string;

  @Column({ type: 'enum', enum: SessionStatus, default: SessionStatus.ACTIVE })
  status!: SessionStatus;

  @Column({ type: 'uuid', name: 'agent_id', nullable: true })
  agentId!: string | null;

  @Column({ type: 'uuid', name: 'persona_id', nullable: true })
  personaId!: string | null;

  @Column({ type: 'enum', enum: SessionMode, default: SessionMode.IDLE })
  mode!: SessionMode;

  @Column({ type: 'timestamptz', name: 'presence_last_ping_at', nullable: true })
  presenceLastPingAt!: Date | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'started_at', type: 'timestamptz' })
  startedAt!: Date;

  @Column({ type: 'timestamptz', name: 'ended_at', nullable: true })
  endedAt!: Date | null;

  @ManyToOne('WorkspaceEntity', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: WorkspaceEntity;

  @ManyToOne('UserEntity', { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'user_id' })
  user!: UserEntity;

  @ManyToOne('AgentEntity', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'agent_id' })
  agent!: AgentEntity | null;

  @ManyToOne('PersonaEntity', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'persona_id' })
  persona!: PersonaEntity | null;

  @OneToMany('MessageEntity', (m: MessageEntity) => m.session)
  messages!: MessageEntity[];

  @OneToMany('RunEntity', (r: RunEntity) => r.session)
  runs!: RunEntity[];
}
