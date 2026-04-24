import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import { ApprovalStateMachine, BlastRadius } from '../database/enums.js';
import type { RunEntity } from './run.entity.js';
import type { SessionEntity } from './session.entity.js';
import type { UserEntity } from './user.entity.js';

@Entity('approvals')
export class ApprovalEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'run_id', nullable: true })
  runId!: string | null;

  @Column({ type: 'uuid', name: 'session_id', nullable: true })
  sessionId!: string | null;

  @Column({ type: 'enum', enum: ApprovalStateMachine, default: ApprovalStateMachine.PENDING })
  state!: ApprovalStateMachine;

  @Column({ type: 'text' })
  description!: string;

  @Column({ type: 'enum', enum: BlastRadius, name: 'blast_radius' })
  blastRadius!: BlastRadius;

  @Column({ type: 'text', array: true, name: 'channels_notified', default: '{}' })
  channelsNotified!: string[];

  @Column({ type: 'text', name: 'resolved_via', nullable: true })
  resolvedVia!: string | null;

  @Column({ type: 'timestamptz', name: 'resolved_at', nullable: true })
  resolvedAt!: Date | null;

  @Column({ type: 'uuid', name: 'resolved_by', nullable: true })
  resolvedBy!: string | null;

  @Column({ type: 'uuid', name: 'webhook_token_jti', unique: true, default: () => 'gen_random_uuid()' })
  webhookTokenJti!: string;

  @Column({ type: 'timestamptz', name: 'webhook_token_expires_at' })
  webhookTokenExpiresAt!: Date;

  @Column({ type: 'text', name: 'chat_notification_id', nullable: true })
  chatNotificationId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @Column({ type: 'timestamptz', name: 'expires_at' })
  expiresAt!: Date;

  @ManyToOne('RunEntity', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'run_id' })
  run!: RunEntity | null;

  @ManyToOne('SessionEntity', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'session_id' })
  session!: SessionEntity | null;

  @ManyToOne('UserEntity', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'resolved_by' })
  resolvedByUser!: UserEntity | null;
}
