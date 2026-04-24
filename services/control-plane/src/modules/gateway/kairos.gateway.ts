import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { randomUUID } from 'node:crypto';
import type { Server, Socket } from 'socket.io';
import type { Repository } from 'typeorm';
import { z } from 'zod';
import { MessageRole, RunStatus } from '../../database/enums.js';
import { MessageEntity } from '../../entities/message.entity.js';
import { RevokedTokenEntity } from '../../entities/revoked-token.entity.js';
import { RunEntity } from '../../entities/run.entity.js';
import { SessionEntity } from '../../entities/session.entity.js';
import type { JwtPayload, JwtUser } from '../auth/types.js';

const SessionJoinPayload = z.object({ session_id: z.string().uuid() });
const UserMessagePayload = z.object({
  session_id: z.string().uuid(),
  content: z.string().min(1),
  request_id: z.string().uuid().optional(),
});
const UserCancelPayload = z.object({ run_id: z.string().uuid() });
const PresencePingPayload = z.object({ session_id: z.string().uuid() });

function getSocketUser(client: Socket): JwtUser | null {
  const user: unknown = (client.data as Record<string, unknown>)['user'];
  if (user == null) return null;
  return user as JwtUser;
}

@WebSocketGateway({ namespace: '/ws', cors: { origin: '*' } })
@Injectable()
export class KairosGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(KairosGateway.name);

  constructor(
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    @InjectRepository(SessionEntity)
    private readonly sessionRepo: Repository<SessionEntity>,
    @InjectRepository(MessageEntity)
    private readonly messageRepo: Repository<MessageEntity>,
    @InjectRepository(RunEntity)
    private readonly runRepo: Repository<RunEntity>,
    @InjectRepository(RevokedTokenEntity)
    private readonly revokedTokens: Repository<RevokedTokenEntity>,
  ) {}

  async handleConnection(client: Socket): Promise<void> {
    const rawToken =
      typeof client.handshake.auth['token'] === 'string'
        ? client.handshake.auth['token']
        : undefined;

    if (rawToken == null) {
      client.emit('error', { code: 'AUTH_REQUIRED', message: 'Missing token' });
      client.disconnect(true);
      return;
    }

    let payload: JwtPayload;
    try {
      payload = this.jwtService.verify<JwtPayload>(rawToken, {
        secret: this.config.getOrThrow<string>('JWT_SECRET'),
      });
    } catch {
      client.emit('error', { code: 'AUTH_REQUIRED', message: 'Invalid token' });
      client.disconnect(true);
      return;
    }

    const revoked = await this.revokedTokens.existsBy({ jti: payload.jti });
    if (revoked) {
      client.emit('error', { code: 'AUTH_REQUIRED', message: 'Token revoked' });
      client.disconnect(true);
      return;
    }

    const user: JwtUser = { id: payload.sub, email: payload.email, role: payload.role };
    (client.data as Record<string, unknown>)['user'] = user;
    await client.join(`user:${user.id}`);

    this.logger.log(`WS connected: user=${user.id} socket=${client.id}`);
  }

  handleDisconnect(client: Socket): void {
    const user = getSocketUser(client);
    if (user != null) {
      this.logger.log(`WS disconnected: user=${user.id} socket=${client.id}`);
    }
  }

  @SubscribeMessage('session.join')
  async handleSessionJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    const user = getSocketUser(client);
    if (user == null) {
      client.emit('error', { code: 'AUTH_REQUIRED', message: 'Not authenticated' });
      return;
    }

    const parsed = SessionJoinPayload.safeParse(payload);
    if (!parsed.success) {
      client.emit('error', { code: 'VALIDATION_FAILED', message: 'Invalid payload' });
      return;
    }

    const session = await this.sessionRepo.findOne({
      where: { id: parsed.data.session_id, userId: user.id },
    });
    if (session == null) {
      client.emit('error', { code: 'NOT_FOUND', message: 'Session not found' });
      return;
    }

    await client.join(`session:${session.id}`);
    client.emit('session.connected', {
      session_id: session.id,
      user_id: user.id,
      mode: session.mode,
      active_agent: session.agentId,
      active_persona: session.personaId,
    });
  }

  @SubscribeMessage('session.leave')
  async handleSessionLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    const parsed = SessionJoinPayload.safeParse(payload);
    if (!parsed.success) return;
    await client.leave(`session:${parsed.data.session_id}`);
  }

  @SubscribeMessage('user.message')
  async handleUserMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    const user = getSocketUser(client);
    if (user == null) {
      client.emit('error', { code: 'AUTH_REQUIRED', message: 'Not authenticated' });
      return;
    }

    const parsed = UserMessagePayload.safeParse(payload);
    if (!parsed.success) {
      client.emit('error', { code: 'VALIDATION_FAILED', message: 'Invalid payload' });
      return;
    }

    const session = await this.sessionRepo.findOne({
      where: { id: parsed.data.session_id, userId: user.id },
    });
    if (session == null) {
      client.emit('error', { code: 'NOT_FOUND', message: 'Session not found' });
      return;
    }

    // Persist user message
    const message = this.messageRepo.create({
      sessionId: session.id,
      role: MessageRole.USER,
      content: parsed.data.content,
    });
    await this.messageRepo.save(message);

    // Create run (QUEUED — cognition dispatch wired in Phase 1.8)
    const run = this.runRepo.create({
      sessionId: session.id,
      workspaceId: session.workspaceId,
      agentRole: 'ego',
      modelId: 'pending',
      status: RunStatus.QUEUED,
    });
    const savedRun = await this.runRepo.save(run);

    // Emit run.started to session room
    this.server.to(`session:${session.id}`).emit('run.started', {
      run_id: savedRun.id,
      session_id: session.id,
      model_id: savedRun.modelId,
      agent_role: savedRun.agentRole,
      request_id: parsed.data.request_id ?? randomUUID(),
    });
  }

  @SubscribeMessage('user.cancel')
  async handleUserCancel(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    const user = getSocketUser(client);
    if (user == null) {
      client.emit('error', { code: 'AUTH_REQUIRED', message: 'Not authenticated' });
      return;
    }

    const parsed = UserCancelPayload.safeParse(payload);
    if (!parsed.success) {
      client.emit('error', { code: 'VALIDATION_FAILED', message: 'Invalid payload' });
      return;
    }

    const run = await this.runRepo.findOne({ where: { id: parsed.data.run_id } });
    if (run == null) {
      client.emit('error', { code: 'NOT_FOUND', message: 'Run not found' });
      return;
    }

    // Verify requester owns the session
    const session = await this.sessionRepo.findOne({
      where: { id: run.sessionId, userId: user.id },
    });
    if (session == null) {
      client.emit('error', { code: 'FORBIDDEN', message: 'Access denied' });
      return;
    }

    if (run.status === RunStatus.QUEUED || run.status === RunStatus.RUNNING) {
      run.status = RunStatus.CANCELLED;
      run.endedAt = new Date();
      await this.runRepo.save(run);

      this.server.to(`session:${session.id}`).emit('run.cancelled', {
        run_id: run.id,
        reason: 'user_cancelled',
      });
    }
  }

  @SubscribeMessage('presence.ping')
  async handlePresencePing(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: unknown,
  ): Promise<void> {
    const user = getSocketUser(client);
    if (user == null) return;

    const parsed = PresencePingPayload.safeParse(payload);
    if (!parsed.success) return;

    await this.sessionRepo.update(
      { id: parsed.data.session_id, userId: user.id },
      { presenceLastPingAt: new Date() },
    );
  }
}
