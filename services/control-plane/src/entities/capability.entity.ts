import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { BlastRadius } from '../database/enums.js';

@Entity('capabilities')
export class CapabilityEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  version!: string | null;

  @Column({ type: 'text', name: 'install_hash', nullable: true })
  installHash!: string | null;

  @Column({ type: 'enum', enum: BlastRadius, name: 'blast_radius', default: BlastRadius.READ })
  blastRadius!: BlastRadius;

  @Column({ type: 'text', array: true, name: 'approved_domains', default: '{}' })
  approvedDomains!: string[];

  @CreateDateColumn({ name: 'installed_at', type: 'timestamptz' })
  installedAt!: Date;

  @Column({ type: 'text', name: 'approved_by' })
  approvedBy!: string;

  @Column({ type: 'timestamptz', name: 'review_date', nullable: true })
  reviewDate!: Date | null;

  @Column({ type: 'text', default: 'active' })
  status!: string;
}
