import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MessageEntity } from '../../entities/message.entity.js';
import { SessionEntity } from '../../entities/session.entity.js';
import { WorkspaceMemberEntity } from '../../entities/workspace-member.entity.js';
import { SessionsController, WorkspaceSessionsController } from './sessions.controller.js';
import { SessionsService } from './sessions.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([SessionEntity, MessageEntity, WorkspaceMemberEntity])],
  controllers: [WorkspaceSessionsController, SessionsController],
  providers: [SessionsService],
  exports: [SessionsService],
})
export class SessionsModule {}
