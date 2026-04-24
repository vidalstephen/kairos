import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import type { PersonaVersionEntity } from './persona-version.entity.js';
import type { WorkspaceEntity } from './workspace.entity.js';

@Entity('personas')
export class PersonaEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'workspace_id', nullable: true })
  workspaceId!: string | null;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text' })
  markdown!: string;

  @Column({ type: 'integer', default: 1 })
  version!: number;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne('WorkspaceEntity', { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: WorkspaceEntity | null;

  @OneToMany('PersonaVersionEntity', (pv: PersonaVersionEntity) => pv.persona)
  versions!: PersonaVersionEntity[];
}
