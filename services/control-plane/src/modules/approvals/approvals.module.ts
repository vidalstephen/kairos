import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEventEntity } from '../../entities/audit-event.entity.js';
import { ApprovalEntity } from '../../entities/approval.entity.js';
import { GatewayModule } from '../gateway/gateway.module.js';
import { ApprovalsController, ApprovalsWebhookController } from './approvals.controller.js';
import { ApprovalsService } from './approvals.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([ApprovalEntity, AuditEventEntity]), GatewayModule],
  controllers: [ApprovalsController, ApprovalsWebhookController],
  providers: [ApprovalsService],
  exports: [ApprovalsService],
})
export class ApprovalsModule {}
