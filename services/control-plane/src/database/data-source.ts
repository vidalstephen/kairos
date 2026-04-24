import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { InitialSchema20260424000001 } from './migrations/20260424000001-initial-schema.js';
import { ToolsApprovalsAudit20260424000002 } from './migrations/20260424000002-tools-approvals-audit.js';
import { Memory20260424000003 } from './migrations/20260424000003-memory.js';
import { SelfState20260424000004 } from './migrations/20260424000004-self-state.js';
import { Layer2State20260424000005 } from './migrations/20260424000005-layer2-state.js';
import { Spans20260424000006 } from './migrations/20260424000006-spans.js';
import { ApprovalsAddCancelled20260425000007 } from './migrations/20260425000007-approvals-add-cancelled.js';
import { CredentialAccessLogAddAccessId20260425000008 } from './migrations/20260425000008-credential-access-log-access-id.js';
import {
  AgentEntity,
  ApprovalEntity,
  AuditEventEntity,
  CapabilityEntity,
  CredentialAccessLogEntity,
  GoalEntity,
  MemoryEntryEntity,
  MessageEntity,
  ModeDefinitionEntity,
  PersonaEntity,
  PersonaVersionEntity,
  PolicyRuleEntity,
  RefreshTokenEntity,
  RevokedTokenEntity,
  RunEntity,
  RunTraceEntity,
  SelfStateSnapshotEntity,
  SessionEntity,
  SkillEntity,
  SpanEntity,
  ThemeEntity,
  ToolExecutionEntity,
  ToolRegistryEntity,
  TraceEntity,
  UserEntity,
  WorkspaceEntity,
  WorkspaceMemberEntity,
} from '../entities/index.js';

export const ALL_ENTITIES = [
  AgentEntity,
  ApprovalEntity,
  AuditEventEntity,
  CapabilityEntity,
  CredentialAccessLogEntity,
  GoalEntity,
  MemoryEntryEntity,
  MessageEntity,
  ModeDefinitionEntity,
  PersonaEntity,
  PersonaVersionEntity,
  PolicyRuleEntity,
  RefreshTokenEntity,
  RevokedTokenEntity,
  RunEntity,
  RunTraceEntity,
  SelfStateSnapshotEntity,
  SessionEntity,
  SkillEntity,
  SpanEntity,
  ThemeEntity,
  ToolExecutionEntity,
  ToolRegistryEntity,
  TraceEntity,
  UserEntity,
  WorkspaceEntity,
  WorkspaceMemberEntity,
] as const;

export const ALL_MIGRATIONS = [
  InitialSchema20260424000001,
  ToolsApprovalsAudit20260424000002,
  Memory20260424000003,
  SelfState20260424000004,
  Layer2State20260424000005,
  Spans20260424000006,
  ApprovalsAddCancelled20260425000007,
  CredentialAccessLogAddAccessId20260425000008,
] as const;

export const AppDataSource = new DataSource({
  type: 'postgres',
  host: process.env['DB_HOST'] ?? 'localhost',
  port: Number(process.env['DB_PORT'] ?? 5432),
  username: process.env['DB_USER'] ?? 'kairos',
  password: process.env['DB_PASSWORD'] ?? 'kairos',
  database: process.env['DB_NAME'] ?? 'kairos',
  entities: [...ALL_ENTITIES],
  migrations: [...ALL_MIGRATIONS],
  migrationsTableName: 'typeorm_migrations',
  synchronize: false,
  logging: process.env['NODE_ENV'] !== 'production',
});
