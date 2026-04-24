import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEventEntity } from '../../entities/audit-event.entity.js';
import { PolicyRuleEntity } from '../../entities/policy-rule.entity.js';
import { CapabilityTokenService } from './capability-token.service.js';
import { PolicyService } from './policy.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([AuditEventEntity, PolicyRuleEntity])],
  providers: [PolicyService, CapabilityTokenService],
  exports: [PolicyService, CapabilityTokenService],
})
export class PolicyModule {}
