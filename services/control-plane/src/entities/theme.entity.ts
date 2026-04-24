import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';

@Entity('themes')
export class ThemeEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'jsonb', default: '{}' })
  spec!: Record<string, unknown>;

  @Column({ type: 'text', name: 'generated_by', default: 'kairos' })
  generatedBy!: string;

  @Column({ type: 'text', name: 'based_on', nullable: true })
  basedOn!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
