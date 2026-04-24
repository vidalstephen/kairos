import { Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';
import type { PersonaEntity } from './persona.entity.js';

@Entity('persona_versions')
export class PersonaVersionEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'uuid', name: 'persona_id' })
  personaId!: string;

  @Column({ type: 'integer' })
  version!: number;

  @Column({ type: 'text' })
  markdown!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne('PersonaEntity', (p: PersonaEntity) => p.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'persona_id' })
  persona!: PersonaEntity;
}
