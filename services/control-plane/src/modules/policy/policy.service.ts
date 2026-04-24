/**
 * Policy service — Layer 0 policy engine.
 *
 * Ingests a tool call request, classifies it, checks standing rules,
 * issues a capability token when auto-approved, and audits every decision.
 */

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { IsNull } from 'typeorm';
import type { Repository } from 'typeorm';
import { AuditCategory, BlastRadius } from '../../database/enums.js';
import { AuditEventEntity } from '../../entities/audit-event.entity.js';
import { PolicyRuleEntity } from '../../entities/policy-rule.entity.js';
import type { ClassifierResult } from './blast-radius-classifier.js';
import { classifyToolCall } from './blast-radius-classifier.js';
import type { CapabilityTokenPayload } from './capability-token.service.js';
import { CapabilityTokenService } from './capability-token.service.js';

// ── Input schema ──────────────────────────────────────────────────────────────

export const EvaluateToolCallSchema = z.object({
  toolCallId: z.string().uuid(),
  toolName: z.string().min(1),
  toolVersion: z.string().optional(),
  params: z.record(z.unknown()),
  manifest: z.record(z.unknown()).default({}),
  sessionId: z.string().uuid(),
  userId: z.string().uuid(),
  workspaceId: z.string().uuid(),
  requestedNetworkDomains: z.array(z.string()).default([]),
  workspaceApprovedDomains: z.array(z.string()).default([]),
});

export type EvaluateToolCallDto = z.infer<typeof EvaluateToolCallSchema>;

// ── Output types ──────────────────────────────────────────────────────────────

export interface PolicyDecision {
  toolCallId: string;
  blastRadius: BlastRadius;
  requiresApproval: boolean;
  capabilityToken: string | null;
  approvedDomainsDelta: string[];
  reason: string;
  auditEventId: string;
}

// ── Service ───────────────────────────────────────────────────────────────────

@Injectable()
export class PolicyService {
  constructor(
    @InjectRepository(AuditEventEntity)
    private readonly auditEvents: Repository<AuditEventEntity>,
    @InjectRepository(PolicyRuleEntity)
    private readonly policyRules: Repository<PolicyRuleEntity>,
    private readonly capabilityTokenService: CapabilityTokenService,
  ) {}

  /**
   * Evaluate a pending tool call.
   * 1. Classify the call → blast-radius band.
   * 2. Check for active standing-authorization rules.
   * 3. Issue capability token when auto-approved.
   * 4. Persist an audit event for every decision.
   */
  async evaluate(dto: EvaluateToolCallDto): Promise<PolicyDecision> {
    // Step 1 — classify
    const classification = classifyToolCall({
      toolName: dto.toolName,
      params: dto.params,
      manifest: dto.manifest,
      workspaceContext: { approvedDomains: dto.workspaceApprovedDomains },
      requestedNetworkDomains: dto.requestedNetworkDomains,
    });

    // Step 2 — standing rule override
    const overrideRule = await this.findStandingRule(
      dto.workspaceId,
      dto.toolName,
      classification.blastRadius,
    );
    const requiresApproval = overrideRule != null ? false : classification.requiresApproval;

    // Step 3 — issue capability token for auto-approved calls
    let capabilityToken: string | null = null;
    if (!requiresApproval) {
      capabilityToken = this.capabilityTokenService.issue({
        toolCallId: dto.toolCallId,
        blastRadius: classification.blastRadius,
        sessionId: dto.sessionId,
        userId: dto.userId,
        workspaceId: dto.workspaceId,
      });
    }

    // Step 4 — audit
    const auditEventId = await this.auditDecision(
      dto,
      classification,
      requiresApproval,
      overrideRule,
    );

    return {
      toolCallId: dto.toolCallId,
      blastRadius: classification.blastRadius,
      requiresApproval,
      capabilityToken,
      approvedDomainsDelta: classification.approvedDomainsDelta,
      reason: classification.reason,
      auditEventId,
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async findStandingRule(
    workspaceId: string,
    toolName: string,
    blastRadius: BlastRadius,
  ): Promise<PolicyRuleEntity | null> {
    const now = new Date();
    const rules = await this.policyRules.find({
      where: [
        { workspaceId, toolName, autoApprove: true },
        { workspaceId: IsNull(), toolName, autoApprove: true },
      ],
    });

    return (
      rules.find(
        (r) =>
          r.blastRadius === blastRadius &&
          r.autoApprove === true &&
          (r.expiresAt == null || r.expiresAt > now),
      ) ?? null
    );
  }

  private async auditDecision(
    dto: EvaluateToolCallDto,
    classification: ClassifierResult,
    requiresApproval: boolean,
    overrideRule: PolicyRuleEntity | null,
  ): Promise<string> {
    const event = this.auditEvents.create({
      category: AuditCategory.POLICY,
      eventType: 'policy.evaluate',
      userId: dto.userId,
      workspaceId: dto.workspaceId,
      sessionId: dto.sessionId,
      runId: null,
      requestId: dto.toolCallId,
      details: {
        toolName: dto.toolName,
        toolVersion: dto.toolVersion ?? null,
        toolCallId: dto.toolCallId,
        blastRadius: classification.blastRadius,
        requiresApproval,
        overrideRuleId: overrideRule?.id ?? null,
        approvedDomainsDelta: classification.approvedDomainsDelta,
        reason: classification.reason,
      },
    });

    const saved = await this.auditEvents.save(event);
    return saved.id;
  }

  /**
   * Verify a capability token previously issued by this service.
   * Delegates to CapabilityTokenService.
   */
  verifyCapabilityToken(token: string): CapabilityTokenPayload | null {
    return this.capabilityTokenService.verify(token);
  }
}
