import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditEventEntity } from '../../entities/audit-event.entity.js';
import { PolicyRuleEntity } from '../../entities/policy-rule.entity.js';
import { VaultModule } from '../vault/vault.module.js';
import { CapabilityTokenService } from './capability-token.service.js';
import { PolicyService } from './policy.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([AuditEventEntity, PolicyRuleEntity]), VaultModule],
  providers: [PolicyService, CapabilityTokenService],
  exports: [PolicyService, CapabilityTokenService, VaultModule],
})
export class PolicyModule {}
