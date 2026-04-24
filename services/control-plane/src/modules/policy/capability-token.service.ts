/**
 * Capability token service — Layer 0 policy engine.
 *
 * Issues short-lived (60 s) HMAC-SHA256 capability tokens that authorise a
 * single tool call after the policy engine has approved it. Tokens are verified
 * with timing-safe comparison to prevent timing attacks.
 *
 * Token format: `<base64url(json_payload)>.<base64url(hmac_sha256)>`
 */

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { BlastRadius } from '../../database/enums.js';

export const CAPABILITY_TOKEN_TTL_MS = 60_000; // 60 seconds

export interface CapabilityTokenPayload {
  toolCallId: string;
  blastRadius: BlastRadius;
  sessionId: string;
  userId: string;
  workspaceId: string;
  issuedAt: number; // Unix epoch ms
  expiresAt: number; // Unix epoch ms
}

@Injectable()
export class CapabilityTokenService {
  private readonly secret: string;

  constructor(private readonly config: ConfigService) {
    this.secret = this.config.getOrThrow<string>('CAPABILITY_TOKEN_SECRET');
  }

  /**
   * Issue a capability token for an approved tool call.
   * Expires in CAPABILITY_TOKEN_TTL_MS (60 s).
   */
  issue(payload: Omit<CapabilityTokenPayload, 'issuedAt' | 'expiresAt'>): string {
    const now = Date.now();
    const full: CapabilityTokenPayload = {
      ...payload,
      issuedAt: now,
      expiresAt: now + CAPABILITY_TOKEN_TTL_MS,
    };

    const encodedPayload = Buffer.from(JSON.stringify(full)).toString('base64url');
    const sig = this.hmac(encodedPayload);
    return `${encodedPayload}.${sig}`;
  }

  /**
   * Verify a capability token.
   * Returns the decoded payload if valid and unexpired, null otherwise.
   * Uses timing-safe comparison to prevent signature oracle attacks.
   */
  verify(token: string): CapabilityTokenPayload | null {
    const dotIdx = token.lastIndexOf('.');
    if (dotIdx === -1) {
      return null;
    }

    const encodedPayload = token.slice(0, dotIdx);
    const receivedSig = token.slice(dotIdx + 1);
    const expectedSig = this.hmac(encodedPayload);

    // Timing-safe comparison — both buffers must be the same length
    let sigsMatch = false;
    try {
      const received = Buffer.from(receivedSig, 'base64url');
      const expected = Buffer.from(expectedSig, 'base64url');
      if (received.length !== expected.length) {
        // Lengths differ — token is invalid; perform a dummy compare to
        // keep execution time constant, then return null.
        timingSafeEqual(expected, expected);
        return null;
      }
      sigsMatch = timingSafeEqual(received, expected);
    } catch {
      return null;
    }

    if (!sigsMatch) {
      return null;
    }

    let payload: CapabilityTokenPayload;
    try {
      payload = JSON.parse(
        Buffer.from(encodedPayload, 'base64url').toString('utf-8'),
      ) as CapabilityTokenPayload;
    } catch {
      return null;
    }

    if (Date.now() > payload.expiresAt) {
      return null;
    }

    return payload;
  }

  private hmac(data: string): string {
    return createHmac('sha256', this.secret).update(data).digest('base64url');
  }
}
