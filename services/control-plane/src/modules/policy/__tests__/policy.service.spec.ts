/**
 * Policy service unit tests.
 * Tests evaluate(), findStandingRule(), audit logging, and verifyCapabilityToken().
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { BlastRadius, AuditCategory } from '../../../database/enums.js';
import { AuditEventEntity } from '../../../entities/audit-event.entity.js';
import { PolicyRuleEntity } from '../../../entities/policy-rule.entity.js';
import { CapabilityTokenService } from '../capability-token.service.js';
import { PolicyService } from '../policy.service.js';
import type { EvaluateToolCallDto } from '../policy.service.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

type MockRepo<T extends object> = {
  [K in keyof Repository<T>]: ReturnType<typeof vi.fn>;
};

function mockRepo<T extends object>(): MockRepo<T> {
  return {
    findOne: vi.fn(),
    find: vi.fn(),
    save: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    existsBy: vi.fn(),
    createQueryBuilder: vi.fn(),
  } as unknown as MockRepo<T>;
}

function makeDto(overrides: Partial<EvaluateToolCallDto> = {}): EvaluateToolCallDto {
  return {
    toolCallId: '11111111-1111-4111-8111-111111111111',
    toolName: 'file_read',
    params: {},
    manifest: {},
    sessionId: '22222222-2222-4222-8222-222222222222',
    userId: '33333333-3333-4333-8333-333333333333',
    workspaceId: '44444444-4444-4444-8444-444444444444',
    requestedNetworkDomains: [],
    workspaceApprovedDomains: [],
    ...overrides,
  };
}

function makePolicyRule(overrides: Partial<PolicyRuleEntity> = {}): PolicyRuleEntity {
  return {
    id: 'rule-uuid-1',
    workspaceId: '44444444-4444-4444-8444-444444444444',
    toolName: 'file_read',
    endpointPattern: null,
    blastRadius: BlastRadius.READ,
    autoApprove: true,
    expiresAt: null,
    createdBy: null,
    createdAt: new Date('2025-01-01'),
    workspace: null as never,
    createdByUser: null as never,
    ...overrides,
  };
}

// ── Setup ─────────────────────────────────────────────────────────────────────

describe('PolicyService', () => {
  let service: PolicyService;
  let auditRepo: MockRepo<AuditEventEntity>;
  let policyRulesRepo: MockRepo<PolicyRuleEntity>;
  let capabilityTokenService: CapabilityTokenService;

  beforeEach(() => {
    auditRepo = mockRepo<AuditEventEntity>();
    policyRulesRepo = mockRepo<PolicyRuleEntity>();

    // Real CapabilityTokenService with a test secret
    const config = {
      getOrThrow: vi.fn().mockReturnValue('test-hmac-secret-for-unit-tests'), // pragma: allowlist secret
    } as unknown as ConfigService;
    capabilityTokenService = new CapabilityTokenService(config);

    service = new PolicyService(
      auditRepo as unknown as Repository<AuditEventEntity>,
      policyRulesRepo as unknown as Repository<PolicyRuleEntity>,
      capabilityTokenService,
    );
  });

  // ── evaluate — auto-approved (read) ──────────────────────────────────────────

  describe('evaluate — READ band (no approval needed)', () => {
    beforeEach(() => {
      vi.mocked(policyRulesRepo.find).mockResolvedValue([]);
      vi.mocked(auditRepo.create).mockImplementation((v) => v as AuditEventEntity);
      vi.mocked(auditRepo.save).mockImplementation(async (v) => ({
        ...(v as AuditEventEntity),
        id: 'audit-uuid-1',
      }));
    });

    it('returns requiresApproval=false for file_read', async () => {
      const result = await service.evaluate(makeDto({ toolName: 'file_read' }));

      expect(result.requiresApproval).toBe(false);
      expect(result.blastRadius).toBe(BlastRadius.READ);
    });

    it('issues a capability token when auto-approved', async () => {
      const result = await service.evaluate(makeDto({ toolName: 'file_read' }));

      expect(result.capabilityToken).not.toBeNull();
      // Token should be verifiable
      const payload = capabilityTokenService.verify(result.capabilityToken!);
      expect(payload).not.toBeNull();
      expect(payload!.blastRadius).toBe(BlastRadius.READ);
      expect(payload!.userId).toBe(makeDto().userId);
    });

    it('writes an audit event for every evaluation', async () => {
      await service.evaluate(makeDto({ toolName: 'file_read' }));

      expect(auditRepo.create).toHaveBeenCalledOnce();
      expect(auditRepo.save).toHaveBeenCalledOnce();

      const createArg = vi.mocked(auditRepo.create).mock.calls[0]?.[0] as Partial<AuditEventEntity>;
      expect(createArg?.category).toBe(AuditCategory.POLICY);
      expect(createArg?.eventType).toBe('policy.evaluate');
    });

    it('returns the audit event id', async () => {
      const result = await service.evaluate(makeDto({ toolName: 'file_read' }));
      expect(result.auditEventId).toBe('audit-uuid-1');
    });
  });

  // ── evaluate — requires approval (destructive) ────────────────────────────

  describe('evaluate — DESTRUCTIVE band (approval required)', () => {
    beforeEach(() => {
      vi.mocked(policyRulesRepo.find).mockResolvedValue([]);
      vi.mocked(auditRepo.create).mockImplementation((v) => v as AuditEventEntity);
      vi.mocked(auditRepo.save).mockImplementation(async (v) => ({
        ...(v as AuditEventEntity),
        id: 'audit-uuid-2',
      }));
    });

    it('returns requiresApproval=true for rm -rf', async () => {
      const result = await service.evaluate(
        makeDto({
          toolName: 'shell_exec',
          params: { command: 'rm -rf /tmp/old' },
        }),
      );

      expect(result.requiresApproval).toBe(true);
      expect(result.blastRadius).toBe(BlastRadius.DESTRUCTIVE);
    });

    it('does NOT issue capability token when approval is required', async () => {
      const result = await service.evaluate(
        makeDto({
          toolName: 'shell_exec',
          params: { command: 'rm -rf /tmp/old' },
        }),
      );

      expect(result.capabilityToken).toBeNull();
    });

    it('audits the destructive classification', async () => {
      await service.evaluate(
        makeDto({ toolName: 'shell_exec', params: { command: 'rm -rf /tmp' } }),
      );

      const createArg = vi.mocked(auditRepo.create).mock.calls[0]?.[0] as Partial<AuditEventEntity>;
      expect((createArg?.details as Record<string, unknown>)?.['blastRadius']).toBe(
        BlastRadius.DESTRUCTIVE,
      );
      expect((createArg?.details as Record<string, unknown>)?.['requiresApproval']).toBe(true);
    });
  });

  // ── evaluate — standing rule override ────────────────────────────────────

  describe('evaluate — standing rule override', () => {
    beforeEach(() => {
      vi.mocked(auditRepo.create).mockImplementation((v) => v as AuditEventEntity);
      vi.mocked(auditRepo.save).mockImplementation(async (v) => ({
        ...(v as AuditEventEntity),
        id: 'audit-uuid-3',
      }));
    });

    it('auto-approves when a matching standing rule exists', async () => {
      // pip_install → INSTALL (normally requires approval)
      // but a standing rule exists for it
      const rule = makePolicyRule({
        toolName: 'pip_install',
        blastRadius: BlastRadius.INSTALL,
        autoApprove: true,
        expiresAt: null,
      });
      vi.mocked(policyRulesRepo.find).mockResolvedValue([rule]);

      const result = await service.evaluate(makeDto({ toolName: 'pip_install' }));

      expect(result.requiresApproval).toBe(false);
      expect(result.capabilityToken).not.toBeNull();
    });

    it('still requires approval when standing rule is expired', async () => {
      const expiredRule = makePolicyRule({
        toolName: 'pip_install',
        blastRadius: BlastRadius.INSTALL,
        autoApprove: true,
        expiresAt: new Date(Date.now() - 1000), // expired 1s ago
      });
      vi.mocked(policyRulesRepo.find).mockResolvedValue([expiredRule]);

      const result = await service.evaluate(makeDto({ toolName: 'pip_install' }));

      expect(result.requiresApproval).toBe(true);
      expect(result.capabilityToken).toBeNull();
    });

    it('records the overrideRuleId in audit details when standing rule is used', async () => {
      const rule = makePolicyRule({
        id: 'standing-rule-uuid',
        toolName: 'file_write',
        blastRadius: BlastRadius.WRITE_LOCAL,
        autoApprove: true,
        expiresAt: null,
      });
      vi.mocked(policyRulesRepo.find).mockResolvedValue([rule]);

      await service.evaluate(makeDto({ toolName: 'file_write' }));

      const createArg = vi.mocked(auditRepo.create).mock.calls[0]?.[0] as Partial<AuditEventEntity>;
      // file_write is WRITE_LOCAL (no approval needed anyway), but rule match is recorded
      expect((createArg?.details as Record<string, unknown>)?.['overrideRuleId']).toBe(
        'standing-rule-uuid',
      );
    });
  });

  // ── evaluate — network egress ─────────────────────────────────────────────

  describe('evaluate — NETWORK_EGRESS_NEW', () => {
    beforeEach(() => {
      vi.mocked(policyRulesRepo.find).mockResolvedValue([]);
      vi.mocked(auditRepo.create).mockImplementation((v) => v as AuditEventEntity);
      vi.mocked(auditRepo.save).mockImplementation(async (v) => ({
        ...(v as AuditEventEntity),
        id: 'audit-uuid-4',
      }));
    });

    it('returns approvedDomainsDelta for GET to unapproved domain', async () => {
      const result = await service.evaluate(
        makeDto({
          toolName: 'http_request',
          params: { method: 'GET' },
          requestedNetworkDomains: ['evil.example.com'],
          workspaceApprovedDomains: [],
        }),
      );

      expect(result.blastRadius).toBe(BlastRadius.NETWORK_EGRESS_NEW);
      expect(result.requiresApproval).toBe(true);
      expect(result.approvedDomainsDelta).toContain('evil.example.com');
    });
  });

  // ── verifyCapabilityToken ─────────────────────────────────────────────────

  describe('verifyCapabilityToken', () => {
    it('verifies a token issued by the service', async () => {
      vi.mocked(policyRulesRepo.find).mockResolvedValue([]);
      vi.mocked(auditRepo.create).mockImplementation((v) => v as AuditEventEntity);
      vi.mocked(auditRepo.save).mockImplementation(async (v) => ({
        ...(v as AuditEventEntity),
        id: 'audit-uuid-5',
      }));

      const decision = await service.evaluate(makeDto({ toolName: 'file_read' }));
      const payload = service.verifyCapabilityToken(decision.capabilityToken!);

      expect(payload).not.toBeNull();
      expect(payload!.toolCallId).toBe(makeDto().toolCallId);
    });

    it('returns null for a tampered token', () => {
      const result = service.verifyCapabilityToken('tampered.token.here');
      expect(result).toBeNull();
    });

    it('returns null for an empty string', () => {
      expect(service.verifyCapabilityToken('')).toBeNull();
    });
  });
});

// ── CapabilityTokenService direct tests ──────────────────────────────────────

describe('CapabilityTokenService', () => {
  let capSvc: CapabilityTokenService;

  beforeEach(() => {
    const config = {
      getOrThrow: vi.fn().mockReturnValue('test-secret-direct'), // pragma: allowlist secret
    } as unknown as ConfigService;
    capSvc = new CapabilityTokenService(config);
  });

  it('issues and verifies a round-trip token', () => {
    const token = capSvc.issue({
      toolCallId: '11111111-1111-4111-8111-111111111111',
      blastRadius: BlastRadius.READ,
      sessionId: '22222222-2222-4222-8222-222222222222',
      userId: '33333333-3333-4333-8333-333333333333',
      workspaceId: '44444444-4444-4444-8444-444444444444',
    });

    const payload = capSvc.verify(token);
    expect(payload).not.toBeNull();
    expect(payload!.blastRadius).toBe(BlastRadius.READ);
  });

  it('returns null when signature is tampered', () => {
    const token = capSvc.issue({
      toolCallId: '11111111-1111-4111-8111-111111111111',
      blastRadius: BlastRadius.READ,
      sessionId: '22222222-2222-4222-8222-222222222222',
      userId: '33333333-3333-4333-8333-333333333333',
      workspaceId: '44444444-4444-4444-8444-444444444444',
    });

    const parts = token.split('.');
    const tampered = `${parts[0]}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`;
    expect(capSvc.verify(tampered)).toBeNull();
  });

  it('returns null for expired token', () => {
    // Manually craft a token with expiresAt in the past
    const payload = {
      toolCallId: '11111111-1111-4111-8111-111111111111',
      blastRadius: BlastRadius.READ,
      sessionId: '22222222-2222-4222-8222-222222222222',
      userId: '33333333-3333-4333-8333-333333333333',
      workspaceId: '44444444-4444-4444-8444-444444444444',
      issuedAt: Date.now() - 120_000,
      expiresAt: Date.now() - 60_000, // expired 1 min ago
    };
    // Access private sign method via type assertion for testing
    const svc = capSvc as unknown as { hmac: (d: string) => string };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const sig = svc.hmac(encodedPayload);
    const expiredToken = `${encodedPayload}.${sig}`;

    expect(capSvc.verify(expiredToken)).toBeNull();
  });

  it('returns null when token has no dot separator', () => {
    expect(capSvc.verify('nodot')).toBeNull();
  });

  it('returns null when payload is not valid JSON', () => {
    const badPayload = Buffer.from('not-json').toString('base64url');
    const svc = capSvc as unknown as { hmac: (d: string) => string };
    const sig = svc.hmac(badPayload);
    expect(capSvc.verify(`${badPayload}.${sig}`)).toBeNull();
  });
});
