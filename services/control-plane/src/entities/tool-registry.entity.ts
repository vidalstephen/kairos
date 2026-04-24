import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { ToolTier } from '../database/enums.js';
import type { ToolExecutionEntity } from './tool-execution.entity.js';

@Entity('tool_registry')
export class ToolRegistryEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', unique: true })
  name!: string;

  @Column({ type: 'text' })
  version!: string;

  @Column({ type: 'jsonb', default: '{}' })
  manifest!: Record<string, unknown>;

  @Column({ type: 'enum', enum: ToolTier, default: ToolTier.T3 })
  tier!: ToolTier;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @OneToMany('ToolExecutionEntity', (te: ToolExecutionEntity) => te.tool)
  executions!: ToolExecutionEntity[];
}
