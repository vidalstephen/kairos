import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessageEntity } from '../../entities/message.entity.js';
import { RevokedTokenEntity } from '../../entities/revoked-token.entity.js';
import { RunEntity } from '../../entities/run.entity.js';
import { SessionEntity } from '../../entities/session.entity.js';
import { AuthModule } from '../auth/auth.module.js';
import { SessionsModule } from '../sessions/sessions.module.js';
import { KairosGateway } from './kairos.gateway.js';

@Module({
  imports: [
    AuthModule,
    SessionsModule,
    TypeOrmModule.forFeature([MessageEntity, RunEntity, RevokedTokenEntity, SessionEntity]),
  ],
  providers: [KairosGateway],
})
export class GatewayModule {}
