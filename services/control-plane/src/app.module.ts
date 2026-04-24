import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ApprovalsModule } from './modules/approvals/approvals.module.js';
import { GatewayModule } from './modules/gateway/gateway.module.js';
import { HealthController } from './modules/health/health.controller.js';
import { PolicyModule } from './modules/policy/policy.module.js';
import { SessionsModule } from './modules/sessions/sessions.module.js';
import { WorkspacesModule } from './modules/workspaces/workspaces.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env['LOG_LEVEL'] ?? 'info',
        ...(process.env['NODE_ENV'] !== 'production'
          ? { transport: { target: 'pino-pretty', options: { singleLine: true } } }
          : {}),
      },
    }),
    ThrottlerModule.forRoot([
      { name: 'global', ttl: 60_000, limit: 300 },
      { name: 'login', ttl: 900_000, limit: 5 },
    ]),
    DatabaseModule,
    AuthModule,
    WorkspacesModule,
    SessionsModule,
    GatewayModule,
    PolicyModule,
    ApprovalsModule,
  ],
  controllers: [HealthController],
  providers: [],
})
export class AppModule {}
