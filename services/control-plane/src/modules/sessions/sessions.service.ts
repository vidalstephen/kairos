import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import type { FindOneOptions, Repository } from 'typeorm';
import { MemberRole, SessionStatus } from '../../database/enums.js';
import { MessageEntity } from '../../entities/message.entity.js';
import { SessionEntity } from '../../entities/session.entity.js';
import { WorkspaceMemberEntity } from '../../entities/workspace-member.entity.js';
import type { CreateSessionDto } from './dto/create-session.dto.js';
import type { UpdateSessionDto } from './dto/update-session.dto.js';

const IDLE_THRESHOLD_MS = 24 * 60 * 60 * 1000;

export interface PaginatedSessions {
  data: SessionEntity[];
  next_cursor: string | null;
  has_more: boolean;
}

export interface SessionQuery {
  status?: SessionStatus;
  cursor?: string;
  limit?: number;
}

@Injectable()
export class SessionsService {
  constructor(
    @InjectRepository(SessionEntity)
    private readonly sessions: Repository<SessionEntity>,
    @InjectRepository(MessageEntity)
    private readonly messages: Repository<MessageEntity>,
    @InjectRepository(WorkspaceMemberEntity)
    private readonly members: Repository<WorkspaceMemberEntity>,
  ) {}

  async create(workspaceId: string, userId: string, dto: CreateSessionDto): Promise<SessionEntity> {
    const member = await this.members.findOne({ where: { workspaceId, userId } });
    if (member == null) {
      throw new ForbiddenException('Access denied');
    }

    const session = this.sessions.create({
      workspaceId,
      userId,
      agentId: dto.agent_id ?? null,
      personaId: dto.persona_id ?? null,
    });
    return this.sessions.save(session);
  }

  async findAll(
    workspaceId: string,
    userId: string,
    query: SessionQuery,
  ): Promise<PaginatedSessions> {
    const member = await this.members.findOne({ where: { workspaceId, userId } });
    if (member == null) {
      throw new ForbiddenException('Access denied');
    }

    const limit = Math.min(query.limit ?? 20, 100);
    const qb = this.sessions
      .createQueryBuilder('s')
      .where('s.workspace_id = :workspaceId', { workspaceId })
      .orderBy('s.started_at', 'ASC')
      .take(limit + 1);

    if (query.status !== undefined) {
      qb.andWhere('s.status = :status', { status: query.status });
    }
    if (query.cursor !== undefined) {
      qb.andWhere('s.started_at > :cursor', { cursor: new Date(query.cursor) });
    }

    const rows = await qb.getMany();
    const has_more = rows.length > limit;
    const data = has_more ? rows.slice(0, limit) : rows;
    const last = data[data.length - 1];
    const next_cursor = has_more && last !== undefined ? last.startedAt.toISOString() : null;

    return { data, next_cursor, has_more };
  }

  async findOne(id: string, userId: string, includeMessages = false): Promise<SessionEntity> {
    const options: FindOneOptions<SessionEntity> = { where: { id } };
    if (includeMessages) {
      options.relations = { messages: true };
    }
    const session = await this.sessions.findOne(options);
    if (session == null) {
      throw new NotFoundException('Session not found');
    }
    if (session.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    return session;
  }

  async update(id: string, userId: string, dto: UpdateSessionDto): Promise<SessionEntity> {
    const session = await this.findOne(id, userId);

    if (dto.agent_id !== undefined) session.agentId = dto.agent_id;
    if (dto.persona_id !== undefined) session.personaId = dto.persona_id;
    if (dto.mode !== undefined) session.mode = dto.mode;

    return this.sessions.save(session);
  }

  async end(id: string, userId: string): Promise<SessionEntity> {
    const session = await this.findOne(id, userId);
    session.status = SessionStatus.CLOSED;
    session.endedAt = new Date();
    return this.sessions.save(session);
  }

  async remove(id: string, userId: string): Promise<void> {
    const session = await this.findOne(id, userId);
    await this.sessions.remove(session);
  }

  async removeAll(workspaceId: string, userId: string): Promise<void> {
    const member = await this.members.findOne({ where: { workspaceId, userId } });
    if (member == null) {
      throw new ForbiddenException('Access denied');
    }
    const allowed: MemberRole[] = [MemberRole.OWNER, MemberRole.ADMIN, MemberRole.OPERATOR];
    if (!allowed.includes(member.role)) {
      throw new ForbiddenException('Insufficient role');
    }
    await this.sessions.delete({ workspaceId });
  }

  async findTrace(id: string, userId: string): Promise<unknown> {
    await this.findOne(id, userId);
    return { session_id: id, spans: [] };
  }

  // ── Cron: expire idle sessions every hour ─────────────────────────────────

  @Cron(CronExpression.EVERY_HOUR)
  async expireIdleSessions(): Promise<void> {
    const threshold = new Date(Date.now() - IDLE_THRESHOLD_MS);
    await this.sessions.query(
      `UPDATE sessions
       SET status = $1
       WHERE status IN ($2, $3)
         AND (
           (presence_last_ping_at IS NOT NULL AND presence_last_ping_at < $4)
           OR (presence_last_ping_at IS NULL AND started_at < $4)
         )`,
      [SessionStatus.EXPIRED, SessionStatus.ACTIVE, SessionStatus.IDLE, threshold],
    );
  }
}
