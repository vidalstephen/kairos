import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CredentialAccessLogEntity } from '../../entities/credential-access-log.entity.js';
import { VaultService } from './vault.service.js';

@Module({
  imports: [TypeOrmModule.forFeature([CredentialAccessLogEntity])],
  providers: [VaultService],
  exports: [VaultService],
})
export class VaultModule {}
