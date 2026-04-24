import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { Repository, UpdateResult } from 'typeorm';
import { z } from 'zod';
import { ApprovalStateMachine, AuditCategory, BlastRadius } from '../../database/enums.js';
import { ApprovalEntity } from '../../entities/approval.entity.js';
import { AuditEventEntity } from '../../entities/audit-event.entity.js';
import { KairosGateway } from '../gateway/kairos.gateway.js';
import { assertTransition } from './approval-state-machine.js';

// ── Default timeouts ──────────────────────────────────────────────────────────

export const DEFAULT_APPROVAL_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes
const WEBHOOK_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

// ── DTOs ──────────────────────────────────────────────────────────────────────

export const CreateApprovalSchema = z.object({
  sessionId: z.string().uuid().nullable().default(null),
  runId: z.string().uuid().nullable().default(null),
  description: z.string().min(1),
  blastRadius: z.nativeEnum(BlastRadius),
  expiresInMs: z.number().int().positive().optional(),
});
export type CreateApprovalDto = z.infer<typeof CreateApprovalSchema>;

export const ResolveApprovalSchema = z.object({
  decision: z.enum(['approved', 'denied']),
});
export type ResolveApprovalDto = z.infer<typeof ResolveApprovalSchema>;

export interface ApprovalQuery {
  sessionId?: string;
  state?: ApprovalStateMachine;
  cursor?: string;
  limit?: number;
}

export interface PaginatedApprovals {
  data: ApprovalEntity[];
  next_cursor: string | null;
  has_more: boolean;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class ApprovalsService {
  private readonly logger = new Logger(ApprovalsService.name);

  constructor(
    @InjectRepository(ApprovalEntity)
    private readonly approvals: Repository<ApprovalEntity>,
    @InjectRepository(AuditEventEntity)
    private readonly auditEvents: Repository<AuditEventEntity>,
    private readonly gateway: KairosGateway,
    private readonly config: ConfigService,
  ) {}

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(dto: CreateApprovalDto, userId: string): Promise<ApprovalEntity> {
    const timeoutMs = dto.expiresInMs ?? DEFAULT_APPROVAL_TIMEOUT_MS;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + timeoutMs);
    const webhookTokenExpiresAt = new Date(now.getTime() + WEBHOOK_TOKEN_TTL_MS);

    const approval = this.approvals.create({
      sessionId: dto.sessionId,
      runId: dto.runId,
      description: dto.description,
      blastRadius: dto.blastRadius,
      state: ApprovalStateMachine.PENDING,
      channelsNotified: [],
      expiresAt,
      webhookTokenExpiresAt,
    });

    const saved = await this.approvals.save(approval);

    this.gateway.server.emit('approval.requested', {
      approval_id: saved.id,
      description: saved.description,
      blast_radius: saved.blastRadius,
      session_id: saved.sessionId,
      expires_at: saved.expiresAt.toISOString(),
    });

    await this.audit({
      userId,
      eventType: 'approval.created',
      ...(dto.sessionId != null ? { sessionId: dto.sessionId } : {}),
      details: { approvalId: saved.id, blastRadius: dto.blastRadius },
    });

    return saved;
  }

  // ── Read ───────────────────────────────────────────────────────────────────

  async findAll(query: ApprovalQuery): Promise<PaginatedApprovals> {
    const limit = Math.min(query.limit ?? 20, 100);
    const qb = this.approvals
      .createQueryBuilder('a')
      .orderBy('a.created_at', 'DESC')
      .take(limit + 1);

    if (query.sessionId != null) {
      qb.andWhere('a.session_id = :sessionId', { sessionId: query.sessionId });
    }
    if (query.state != null) {
      qb.andWhere('a.state = :state', { state: query.state });
    }
    if (query.cursor != null) {
      qb.andWhere('a.created_at < :cursor', { cursor: new Date(query.cursor) });
    }

    const rows = await qb.getMany();
    const has_more = rows.length > limit;
    const data = has_more ? rows.slice(0, limit) : rows;
    const last = data[data.length - 1];
    const next_cursor = has_more && last != null ? last.createdAt.toISOString() : null;

    return { data, next_cursor, has_more };
  }

  async findOne(id: string): Promise<ApprovalEntity> {
    const approval = await this.approvals.findOne({ where: { id } });
    if (approval == null) throw new NotFoundException('Approval not found');
    return approval;
  }

  // ── Resolve (REST) ─────────────────────────────────────────────────────────

  async resolve(id: string, dto: ResolveApprovalDto, userId: string): Promise<ApprovalEntity> {
    const approval = await this.findOne(id);
    const nextState =
      dto.decision === 'approved' ? ApprovalStateMachine.APPROVED : ApprovalStateMachine.DENIED;

    assertTransition(approval.state, nextState);

    approval.state = nextState;
    approval.resolvedAt = new Date();
    approval.resolvedBy = userId;
    approval.resolvedVia = 'api';

    const saved = await this.approvals.save(approval);

    this.gateway.server.emit('approval.resolved', {
      approval_id: saved.id,
      decision: dto.decision,
      resolved_by: userId,
      resolved_at: saved.resolvedAt?.toISOString(),
    });

    await this.audit({
      userId,
      eventType: 'approval.resolved',
      ...(saved.sessionId != null ? { sessionId: saved.sessionId } : {}),
      details: { approvalId: saved.id, decision: dto.decision },
    });

    return saved;
  }

  // ── Resolve (webhook) ──────────────────────────────────────────────────────

  async resolveViaWebhook(
    jti: string,
    decision: 'approved' | 'denied',
    signature: string,
    rawBody: Buffer,
  ): Promise<ApprovalEntity> {
    const approval = await this.approvals.findOne({ where: { webhookTokenJti: jti } });
    if (approval == null) throw new NotFoundException('Approval not found');

    if (new Date() > approval.webhookTokenExpiresAt) {
      throw new UnprocessableEntityException('Webhook token expired');
    }

    const webhookSecret = this.config.getOrThrow<string>('WEBHOOK_SECRET');
    const expectedHex = createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
    const expectedBuf = Buffer.from(`sha256=${expectedHex}`, 'utf8');
    const actualBuf = Buffer.from(signature, 'utf8');

    if (expectedBuf.length !== actualBuf.length || !timingSafeEqual(expectedBuf, actualBuf)) {
      throw new ForbiddenException('Invalid webhook signature');
    }

    const nextState =
      decision === 'approved' ? ApprovalStateMachine.APPROVED : ApprovalStateMachine.DENIED;
    assertTransition(approval.state, nextState);

    approval.state = nextState;
    approval.resolvedAt = new Date();
    approval.resolvedVia = 'webhook';

    const saved = await this.approvals.save(approval);

    this.gateway.server.emit('approval.resolved', {
      approval_id: saved.id,
      decision,
      resolved_via: 'webhook',
      resolved_at: saved.resolvedAt?.toISOString(),
    });

    await this.audit({
      eventType: 'approval.resolved',
      ...(saved.sessionId != null ? { sessionId: saved.sessionId } : {}),
      details: { approvalId: saved.id, decision, resolvedVia: 'webhook' },
    });

    return saved;
  }

  // ── Cancel ─────────────────────────────────────────────────────────────────

  async cancel(id: string, userId: string): Promise<ApprovalEntity> {
    const approval = await this.findOne(id);
    assertTransition(approval.state, ApprovalStateMachine.CANCELLED);

    approval.state = ApprovalStateMachine.CANCELLED;
    approval.resolvedAt = new Date();
    approval.resolvedBy = userId;
    approval.resolvedVia = 'cancel';

    const saved = await this.approvals.save(approval);

    this.gateway.server.emit('approval.resolved', {
      approval_id: saved.id,
      decision: 'cancelled',
      resolved_by: userId,
      resolved_at: saved.resolvedAt?.toISOString(),
    });

    await this.audit({
      userId,
      eventType: 'approval.cancelled',
      ...(saved.sessionId != null ? { sessionId: saved.sessionId } : {}),
      details: { approvalId: saved.id },
    });

    return saved;
  }

  // ── Timeout worker ─────────────────────────────────────────────────────────

  @Cron(CronExpression.EVERY_MINUTE)
  async expireStaleApprovals(): Promise<void> {
    const now = new Date();
    const result: UpdateResult = await this.approvals
      .createQueryBuilder()
      .update(ApprovalEntity)
      .set({ state: ApprovalStateMachine.EXPIRED })
      .where('state = :state', { state: ApprovalStateMachine.PENDING })
      .andWhere('expires_at < :now', { now })
      .execute();

    const count = result.affected ?? 0;
    if (count > 0) {
      this.logger.log(`Expired ${count} stale approval(s)`);
      this.gateway.server.emit('approval.expired', { count });
    }
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async audit(params: {
    userId?: string;
    eventType: string;
    sessionId?: string;
    details: Record<string, unknown>;
  }): Promise<void> {
    const event = this.auditEvents.create({
      category: AuditCategory.APPROVAL,
      eventType: params.eventType,
      userId: params.userId ?? null,
      sessionId: params.sessionId ?? null,
      details: params.details,
      requestId: randomUUID(),
    });
    await this.auditEvents.save(event);
  }
}
