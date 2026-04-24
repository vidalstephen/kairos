/**
 * ApprovalsService unit tests.
 * Tests create(), findAll(), findOne(), resolve(), resolveViaWebhook(), cancel(),
 * and expireStaleApprovals().
 */

import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { ApprovalStateMachine, AuditCategory, BlastRadius } from '../../../database/enums.js';
import { ApprovalEntity } from '../../../entities/approval.entity.js';
import { AuditEventEntity } from '../../../entities/audit-event.entity.js';
import { ApprovalsService } from '../approvals.service.js';

// ── Types / helpers ───────────────────────────────────────────────────────────

type MockRepo<T extends object> = {
  [K in keyof Repository<T>]: ReturnType<typeof vi.fn>;
};

function mockRepo<T extends object>(): MockRepo<T> {
  return {
    findOne: vi.fn(),
    find: vi.fn(),
    save: vi.fn((e: T) => Promise.resolve(e)),
    create: vi.fn((data: Partial<T>) => data as T),
    update: vi.fn(),
    existsBy: vi.fn(),
    createQueryBuilder: vi.fn(),
  } as unknown as MockRepo<T>;
}

const TEST_WEBHOOK_SECRET = 'test-webhook-secret-for-unit-tests'; // pragma: allowlist secret

function makeApproval(overrides: Partial<ApprovalEntity> = {}): ApprovalEntity {
  return {
    id: 'approval-uuid-1',
    sessionId: 'session-uuid-1',
    runId: null,
    state: ApprovalStateMachine.PENDING,
    description: 'Test approval',
    blastRadius: BlastRadius.DESTRUCTIVE,
    channelsNotified: [],
    resolvedVia: null,
    resolvedAt: null,
    resolvedBy: null,
    webhookTokenJti: 'jti-uuid-1',
    webhookTokenExpiresAt: new Date(Date.now() + 3_600_000),
    chatNotificationId: null,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    expiresAt: new Date(Date.now() + 600_000),
    run: null,
    session: null,
    resolvedByUser: null,
    ...overrides,
  };
}

// Minimal mock of KairosGateway — only server.emit is used
const makeGateway = () => ({
  server: { emit: vi.fn() },
});

// ── Setup ─────────────────────────────────────────────────────────────────────

describe('ApprovalsService', () => {
  let service: ApprovalsService;
  let approvalRepo: MockRepo<ApprovalEntity>;
  let auditRepo: MockRepo<AuditEventEntity>;
  let gateway: ReturnType<typeof makeGateway>;
  let config: ConfigService;

  beforeEach(() => {
    approvalRepo = mockRepo<ApprovalEntity>();
    auditRepo = mockRepo<AuditEventEntity>();
    gateway = makeGateway();
    config = {
      getOrThrow: vi.fn().mockReturnValue(TEST_WEBHOOK_SECRET),
    } as unknown as ConfigService;

    service = new ApprovalsService(
      approvalRepo as unknown as Repository<ApprovalEntity>,
      auditRepo as unknown as Repository<AuditEventEntity>,
      gateway as never,
      config,
    );
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create', () => {
    it('saves a PENDING approval and emits approval.requested', async () => {
      const saved = makeApproval();
      vi.mocked(approvalRepo.save).mockResolvedValue(saved);
      vi.mocked(auditRepo.save).mockResolvedValue({} as AuditEventEntity);

      const result = await service.create(
        {
          sessionId: 'session-uuid-1',
          runId: null,
          description: 'Test approval',
          blastRadius: BlastRadius.DESTRUCTIVE,
        },
        'user-uuid-1',
      );

      expect(result).toBe(saved);
      expect(approvalRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ state: ApprovalStateMachine.PENDING }),
      );
      expect(gateway.server.emit).toHaveBeenCalledWith(
        'approval.requested',
        expect.objectContaining({ approval_id: saved.id }),
      );
      expect(auditRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ category: AuditCategory.APPROVAL, eventType: 'approval.created' }),
      );
    });

    it('uses default timeout when expiresInMs is not provided', async () => {
      vi.mocked(approvalRepo.save).mockResolvedValue(makeApproval());
      vi.mocked(auditRepo.save).mockResolvedValue({} as AuditEventEntity);

      await service.create(
        { sessionId: null, runId: null, description: 'x', blastRadius: BlastRadius.READ },
        'user-1',
      );

      const createArg = vi.mocked(approvalRepo.create).mock.calls[0]?.[0] as Partial<ApprovalEntity>;
      expect(createArg?.expiresAt).toBeDefined();
    });
  });

  // ── findAll ─────────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('returns paginated results with no next_cursor when under limit', async () => {
      const items = [makeApproval(), makeApproval({ id: 'approval-uuid-2' })];
      const qb = {
        orderBy: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue(items),
      };
      vi.mocked(approvalRepo.createQueryBuilder).mockReturnValue(qb as never);

      const result = await service.findAll({ limit: 20 });
      expect(result.data).toHaveLength(2);
      expect(result.has_more).toBe(false);
      expect(result.next_cursor).toBeNull();
    });

    it('returns next_cursor when there are more results', async () => {
      const items = Array.from({ length: 21 }, (_, i) =>
        makeApproval({ id: `id-${i}`, createdAt: new Date(`2025-01-${String(i + 1).padStart(2, '0')}`) }),
      );
      const qb = {
        orderBy: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue(items),
      };
      vi.mocked(approvalRepo.createQueryBuilder).mockReturnValue(qb as never);

      const result = await service.findAll({ limit: 20 });
      expect(result.data).toHaveLength(20);
      expect(result.has_more).toBe(true);
      expect(result.next_cursor).not.toBeNull();
    });

    it('passes sessionId filter to query builder', async () => {
      const qb = {
        orderBy: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(approvalRepo.createQueryBuilder).mockReturnValue(qb as never);

      await service.findAll({ sessionId: 'session-uuid-1' });
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('session_id'),
        expect.objectContaining({ sessionId: 'session-uuid-1' }),
      );
    });

    it('passes state filter to query builder', async () => {
      const qb = {
        orderBy: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(approvalRepo.createQueryBuilder).mockReturnValue(qb as never);

      await service.findAll({ state: ApprovalStateMachine.PENDING });
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('state'),
        expect.objectContaining({ state: ApprovalStateMachine.PENDING }),
      );
    });

    it('passes cursor to query builder', async () => {
      const qb = {
        orderBy: vi.fn().mockReturnThis(),
        take: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([]),
      };
      vi.mocked(approvalRepo.createQueryBuilder).mockReturnValue(qb as never);

      await service.findAll({ cursor: '2025-01-01T00:00:00.000Z' });
      expect(qb.andWhere).toHaveBeenCalledWith(
        expect.stringContaining('created_at'),
        expect.any(Object),
      );
    });
  });

  // ── findOne ──────────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('returns approval when found', async () => {
      const approval = makeApproval();
      vi.mocked(approvalRepo.findOne).mockResolvedValue(approval);
      await expect(service.findOne('approval-uuid-1')).resolves.toBe(approval);
    });

    it('throws NotFoundException when not found', async () => {
      vi.mocked(approvalRepo.findOne).mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  // ── resolve ──────────────────────────────────────────────────────────────────

  describe('resolve', () => {
    it('approves a PENDING approval and emits approval.resolved', async () => {
      const approval = makeApproval();
      vi.mocked(approvalRepo.findOne).mockResolvedValue(approval);
      vi.mocked(approvalRepo.save).mockResolvedValue({ ...approval, state: ApprovalStateMachine.APPROVED });
      vi.mocked(auditRepo.save).mockResolvedValue({} as AuditEventEntity);

      const result = await service.resolve('approval-uuid-1', { decision: 'approved' }, 'user-1');

      expect(result.state).toBe(ApprovalStateMachine.APPROVED);
      expect(gateway.server.emit).toHaveBeenCalledWith(
        'approval.resolved',
        expect.objectContaining({ decision: 'approved' }),
      );
    });

    it('denies a PENDING approval', async () => {
      const approval = makeApproval();
      vi.mocked(approvalRepo.findOne).mockResolvedValue(approval);
      vi.mocked(approvalRepo.save).mockResolvedValue({ ...approval, state: ApprovalStateMachine.DENIED });
      vi.mocked(auditRepo.save).mockResolvedValue({} as AuditEventEntity);

      const result = await service.resolve('approval-uuid-1', { decision: 'denied' }, 'user-1');
      expect(result.state).toBe(ApprovalStateMachine.DENIED);
    });

    it('throws when trying to resolve an already-approved approval', async () => {
      vi.mocked(approvalRepo.findOne).mockResolvedValue(
        makeApproval({ state: ApprovalStateMachine.APPROVED }),
      );
      await expect(
        service.resolve('approval-uuid-1', { decision: 'denied' }, 'user-1'),
      ).rejects.toThrow(/Invalid approval transition/);
    });

    it('throws NotFoundException when approval not found', async () => {
      vi.mocked(approvalRepo.findOne).mockResolvedValue(null);
      await expect(
        service.resolve('missing', { decision: 'approved' }, 'user-1'),
      ).rejects.toThrow(NotFoundException);
    });

    it('sets resolvedVia to "api"', async () => {
      const approval = makeApproval();
      vi.mocked(approvalRepo.findOne).mockResolvedValue(approval);
      vi.mocked(approvalRepo.save).mockImplementation((a) => Promise.resolve(a as ApprovalEntity));
      vi.mocked(auditRepo.save).mockResolvedValue({} as AuditEventEntity);

      await service.resolve('approval-uuid-1', { decision: 'approved' }, 'user-1');
      expect(approvalRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ resolvedVia: 'api' }),
      );
    });
  });

  // ── cancel ───────────────────────────────────────────────────────────────────

  describe('cancel', () => {
    it('cancels a PENDING approval', async () => {
      const approval = makeApproval();
      vi.mocked(approvalRepo.findOne).mockResolvedValue(approval);
      vi.mocked(approvalRepo.save).mockImplementation((a) => Promise.resolve(a as ApprovalEntity));
      vi.mocked(auditRepo.save).mockResolvedValue({} as AuditEventEntity);

      const result = await service.cancel('approval-uuid-1', 'user-1');
      expect(result.state).toBe(ApprovalStateMachine.CANCELLED);
      expect(result.resolvedVia).toBe('cancel');
    });

    it('emits approval.resolved with decision=cancelled', async () => {
      const approval = makeApproval();
      vi.mocked(approvalRepo.findOne).mockResolvedValue(approval);
      vi.mocked(approvalRepo.save).mockImplementation((a) => Promise.resolve(a as ApprovalEntity));
      vi.mocked(auditRepo.save).mockResolvedValue({} as AuditEventEntity);

      await service.cancel('approval-uuid-1', 'user-1');
      expect(gateway.server.emit).toHaveBeenCalledWith(
        'approval.resolved',
        expect.objectContaining({ decision: 'cancelled' }),
      );
    });

    it('throws when trying to cancel a terminal approval', async () => {
      vi.mocked(approvalRepo.findOne).mockResolvedValue(
        makeApproval({ state: ApprovalStateMachine.APPROVED }),
      );
      await expect(service.cancel('approval-uuid-1', 'user-1')).rejects.toThrow(
        /Invalid approval transition/,
      );
    });
  });

  // ── resolveViaWebhook ─────────────────────────────────────────────────────────

  describe('resolveViaWebhook', () => {
    function makeSignature(secret: string, body: Buffer): string {
      const hex = createHmac('sha256', secret).update(body).digest('hex');
      return `sha256=${hex}`;
    }

    it('resolves via webhook with valid signature', async () => {
      const approval = makeApproval();
      vi.mocked(approvalRepo.findOne).mockResolvedValue(approval);
      vi.mocked(approvalRepo.save).mockImplementation((a) => Promise.resolve(a as ApprovalEntity));
      vi.mocked(auditRepo.save).mockResolvedValue({} as AuditEventEntity);

      const rawBody = Buffer.from('"decision":"approved"}');
      const sig = makeSignature(TEST_WEBHOOK_SECRET, rawBody);

      const result = await service.resolveViaWebhook('jti-uuid-1', 'approved', sig, rawBody);
      expect(result.state).toBe(ApprovalStateMachine.APPROVED);
      expect(result.resolvedVia).toBe('webhook');
    });

    it('throws ForbiddenException for invalid signature', async () => {
      vi.mocked(approvalRepo.findOne).mockResolvedValue(makeApproval());
      const rawBody = Buffer.from('{"decision":"approved"}');

      await expect(
        service.resolveViaWebhook('jti-uuid-1', 'approved', 'sha256=badhash', rawBody),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws UnprocessableEntityException when webhook token is expired', async () => {
      vi.mocked(approvalRepo.findOne).mockResolvedValue(
        makeApproval({ webhookTokenExpiresAt: new Date(Date.now() - 1000) }),
      );
      const rawBody = Buffer.from('{}');
      await expect(
        service.resolveViaWebhook('jti-uuid-1', 'approved', 'sha256=x', rawBody),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws NotFoundException when JTI not found', async () => {
      vi.mocked(approvalRepo.findOne).mockResolvedValue(null);
      await expect(
        service.resolveViaWebhook('missing-jti', 'approved', 'sha256=x', Buffer.from('')),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws when trying to resolve an already-denied approval via webhook', async () => {
      const approval = makeApproval({ state: ApprovalStateMachine.DENIED });
      vi.mocked(approvalRepo.findOne).mockResolvedValue(approval);
      const rawBody = Buffer.from('{"decision":"approved"}');
      const sig = makeSignature(TEST_WEBHOOK_SECRET, rawBody);

      await expect(
        service.resolveViaWebhook('jti-uuid-1', 'approved', sig, rawBody),
      ).rejects.toThrow(/Invalid approval transition/);
    });

    it('emits approval.resolved with resolved_via=webhook', async () => {
      const approval = makeApproval();
      vi.mocked(approvalRepo.findOne).mockResolvedValue(approval);
      vi.mocked(approvalRepo.save).mockImplementation((a) => Promise.resolve(a as ApprovalEntity));
      vi.mocked(auditRepo.save).mockResolvedValue({} as AuditEventEntity);

      const rawBody = Buffer.from('{"decision":"denied"}');
      const sig = makeSignature(TEST_WEBHOOK_SECRET, rawBody);

      await service.resolveViaWebhook('jti-uuid-1', 'denied', sig, rawBody);
      expect(gateway.server.emit).toHaveBeenCalledWith(
        'approval.resolved',
        expect.objectContaining({ resolved_via: 'webhook', decision: 'denied' }),
      );
    });
  });

  // ── expireStaleApprovals ──────────────────────────────────────────────────────

  describe('expireStaleApprovals', () => {
    it('updates stale PENDING approvals to EXPIRED', async () => {
      const qb = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ affected: 3 }),
      };
      vi.mocked(approvalRepo.createQueryBuilder).mockReturnValue(qb as never);

      await service.expireStaleApprovals();

      expect(qb.set).toHaveBeenCalledWith(
        expect.objectContaining({ state: ApprovalStateMachine.EXPIRED }),
      );
      expect(gateway.server.emit).toHaveBeenCalledWith('approval.expired', { count: 3 });
    });

    it('does not emit when no approvals expired', async () => {
      const qb = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ affected: 0 }),
      };
      vi.mocked(approvalRepo.createQueryBuilder).mockReturnValue(qb as never);

      await service.expireStaleApprovals();
      expect(gateway.server.emit).not.toHaveBeenCalled();
    });

    it('handles null affected count gracefully', async () => {
      const qb = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        andWhere: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ affected: null }),
      };
      vi.mocked(approvalRepo.createQueryBuilder).mockReturnValue(qb as never);

      await expect(service.expireStaleApprovals()).resolves.not.toThrow();
      expect(gateway.server.emit).not.toHaveBeenCalled();
    });
  });
});
