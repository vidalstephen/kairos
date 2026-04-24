import { CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity('revoked_tokens')
export class RevokedTokenEntity {
  @PrimaryColumn({ type: 'uuid' })
  jti!: string;

  @CreateDateColumn({ name: 'revoked_at', type: 'timestamptz' })
  revokedAt!: Date;
}
