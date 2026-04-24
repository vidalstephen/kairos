/**
 * Approval state machine — pure, deterministic, 100% branch coverage.
 *
 * Valid states:  PENDING (non-terminal)
 *                APPROVED | DENIED | EXPIRED | CANCELLED (terminal)
 *
 * Valid transitions:  PENDING → APPROVED
 *                     PENDING → DENIED
 *                     PENDING → EXPIRED
 *                     PENDING → CANCELLED
 *
 * All other transitions are illegal and throw.
 */

import { ApprovalStateMachine } from '../../database/enums.js';

/** States from which no further transitions are permitted. */
const TERMINAL_STATES = new Set<ApprovalStateMachine>([
  ApprovalStateMachine.APPROVED,
  ApprovalStateMachine.DENIED,
  ApprovalStateMachine.EXPIRED,
  ApprovalStateMachine.CANCELLED,
]);

/**
 * Allowed target states keyed by the current (source) state.
 * Only PENDING has valid targets; all terminal states have none.
 */
const ALLOWED_TARGETS = new Map<ApprovalStateMachine, ReadonlySet<ApprovalStateMachine>>([
  [
    ApprovalStateMachine.PENDING,
    new Set([
      ApprovalStateMachine.APPROVED,
      ApprovalStateMachine.DENIED,
      ApprovalStateMachine.EXPIRED,
      ApprovalStateMachine.CANCELLED,
    ]),
  ],
]);

/**
 * Returns `true` if the given state is terminal (no further transitions
 * are allowed).
 */
export function isTerminal(state: ApprovalStateMachine): boolean {
  return TERMINAL_STATES.has(state);
}

/**
 * Returns `true` when the transition `from → to` is valid according to the
 * state machine definition.
 */
export function canTransition(from: ApprovalStateMachine, to: ApprovalStateMachine): boolean {
  if (isTerminal(from)) return false;
  const targets = ALLOWED_TARGETS.get(from);
  if (targets == null) return false;
  return targets.has(to);
}

/**
 * Asserts that the transition `from → to` is valid.
 * Throws `Error` if the transition is illegal.
 */
export function assertTransition(from: ApprovalStateMachine, to: ApprovalStateMachine): void {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid approval transition: ${from} → ${to}`);
  }
}
