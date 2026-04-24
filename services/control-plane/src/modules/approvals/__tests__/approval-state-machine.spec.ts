import { describe, expect, it } from 'vitest';
import { ApprovalStateMachine } from '../../../database/enums.js';
import {
  assertTransition,
  canTransition,
  isTerminal,
} from '../approval-state-machine.js';

// ── isTerminal ────────────────────────────────────────────────────────────────

describe('isTerminal', () => {
  it('returns false for PENDING', () => {
    expect(isTerminal(ApprovalStateMachine.PENDING)).toBe(false);
  });

  it('returns true for APPROVED', () => {
    expect(isTerminal(ApprovalStateMachine.APPROVED)).toBe(true);
  });

  it('returns true for DENIED', () => {
    expect(isTerminal(ApprovalStateMachine.DENIED)).toBe(true);
  });

  it('returns true for EXPIRED', () => {
    expect(isTerminal(ApprovalStateMachine.EXPIRED)).toBe(true);
  });

  it('returns true for CANCELLED', () => {
    expect(isTerminal(ApprovalStateMachine.CANCELLED)).toBe(true);
  });
});

// ── canTransition ─────────────────────────────────────────────────────────────

describe('canTransition', () => {
  // PENDING → allowed targets
  it('allows PENDING → APPROVED', () => {
    expect(canTransition(ApprovalStateMachine.PENDING, ApprovalStateMachine.APPROVED)).toBe(true);
  });

  it('allows PENDING → DENIED', () => {
    expect(canTransition(ApprovalStateMachine.PENDING, ApprovalStateMachine.DENIED)).toBe(true);
  });

  it('allows PENDING → EXPIRED', () => {
    expect(canTransition(ApprovalStateMachine.PENDING, ApprovalStateMachine.EXPIRED)).toBe(true);
  });

  it('allows PENDING → CANCELLED', () => {
    expect(canTransition(ApprovalStateMachine.PENDING, ApprovalStateMachine.CANCELLED)).toBe(true);
  });

  // PENDING → PENDING is not allowed
  it('disallows PENDING → PENDING', () => {
    expect(canTransition(ApprovalStateMachine.PENDING, ApprovalStateMachine.PENDING)).toBe(false);
  });

  // Terminal states cannot transition anywhere
  it('disallows APPROVED → DENIED', () => {
    expect(canTransition(ApprovalStateMachine.APPROVED, ApprovalStateMachine.DENIED)).toBe(false);
  });

  it('disallows APPROVED → APPROVED', () => {
    expect(canTransition(ApprovalStateMachine.APPROVED, ApprovalStateMachine.APPROVED)).toBe(false);
  });

  it('disallows DENIED → APPROVED', () => {
    expect(canTransition(ApprovalStateMachine.DENIED, ApprovalStateMachine.APPROVED)).toBe(false);
  });

  it('disallows DENIED → CANCELLED', () => {
    expect(canTransition(ApprovalStateMachine.DENIED, ApprovalStateMachine.CANCELLED)).toBe(false);
  });

  it('disallows EXPIRED → APPROVED', () => {
    expect(canTransition(ApprovalStateMachine.EXPIRED, ApprovalStateMachine.APPROVED)).toBe(false);
  });

  it('disallows EXPIRED → PENDING', () => {
    expect(canTransition(ApprovalStateMachine.EXPIRED, ApprovalStateMachine.PENDING)).toBe(false);
  });

  it('disallows CANCELLED → APPROVED', () => {
    expect(canTransition(ApprovalStateMachine.CANCELLED, ApprovalStateMachine.APPROVED)).toBe(
      false,
    );
  });

  it('disallows CANCELLED → PENDING', () => {
    expect(canTransition(ApprovalStateMachine.CANCELLED, ApprovalStateMachine.PENDING)).toBe(false);
  });
});

// ── assertTransition ──────────────────────────────────────────────────────────

describe('assertTransition', () => {
  it('does not throw for valid PENDING → APPROVED', () => {
    expect(() =>
      assertTransition(ApprovalStateMachine.PENDING, ApprovalStateMachine.APPROVED),
    ).not.toThrow();
  });

  it('does not throw for valid PENDING → DENIED', () => {
    expect(() =>
      assertTransition(ApprovalStateMachine.PENDING, ApprovalStateMachine.DENIED),
    ).not.toThrow();
  });

  it('does not throw for valid PENDING → EXPIRED', () => {
    expect(() =>
      assertTransition(ApprovalStateMachine.PENDING, ApprovalStateMachine.EXPIRED),
    ).not.toThrow();
  });

  it('does not throw for valid PENDING → CANCELLED', () => {
    expect(() =>
      assertTransition(ApprovalStateMachine.PENDING, ApprovalStateMachine.CANCELLED),
    ).not.toThrow();
  });

  it('throws for invalid APPROVED → DENIED', () => {
    expect(() =>
      assertTransition(ApprovalStateMachine.APPROVED, ApprovalStateMachine.DENIED),
    ).toThrow(/Invalid approval transition/);
  });

  it('throws for invalid DENIED → APPROVED', () => {
    expect(() =>
      assertTransition(ApprovalStateMachine.DENIED, ApprovalStateMachine.APPROVED),
    ).toThrow(/Invalid approval transition/);
  });

  it('throws for invalid EXPIRED → APPROVED', () => {
    expect(() =>
      assertTransition(ApprovalStateMachine.EXPIRED, ApprovalStateMachine.APPROVED),
    ).toThrow(/Invalid approval transition/);
  });

  it('throws for invalid CANCELLED → PENDING', () => {
    expect(() =>
      assertTransition(ApprovalStateMachine.CANCELLED, ApprovalStateMachine.PENDING),
    ).toThrow(/Invalid approval transition/);
  });

  it('throws with message containing both states', () => {
    expect(() =>
      assertTransition(ApprovalStateMachine.APPROVED, ApprovalStateMachine.CANCELLED),
    ).toThrow(`Invalid approval transition: ${ApprovalStateMachine.APPROVED} → ${ApprovalStateMachine.CANCELLED}`);
  });
});
