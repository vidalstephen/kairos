/**
 * Blast-radius classifier — Layer 0 policy engine.
 *
 * Deterministic, pure function. No side-effects. No external I/O.
 * All six BlastRadius bands are covered.
 *
 * Rule order follows docs/security/blast-radius-policy.md §Classification Rules.
 * IMPORTANT: rules are applied in the order defined by the spec. BENIGN_READ is
 * evaluated before DESTRUCTIVE for shell exec. Compound commands that embed a
 * destructive operator after a benign lead token will be classified as the lead
 * token's band. Sandbox enforcement at the execution layer provides the second
 * line of defence for chained commands (out of scope for this classifier).
 */

import { BlastRadius } from '../../database/enums.js';

// ── Public types ──────────────────────────────────────────────────────────────

export interface ClassifierInput {
  toolName: string;
  params: Record<string, unknown>;
  manifest: Record<string, unknown>;
  workspaceContext: { approvedDomains: string[] };
  requestedNetworkDomains?: string[];
}

export interface ClassifierResult {
  blastRadius: BlastRadius;
  requiresApproval: boolean;
  requiresToken: boolean;
  approvedDomainsDelta: string[];
  reason: string;
}

// ── Shell exec regexes ────────────────────────────────────────────────────────

/**
 * Matches commands whose first token is a well-known read-only shell utility,
 * plus `curl --head / -I` and `sed` without an in-place (-i) flag.
 * Anchored at start-of-string.
 */
const BENIGN_READ_RX =
  /^(?:cat|ls|ll|la|grep|egrep|fgrep|find|head|tail|wc|echo|pwd|which|type|whereis|env|date|basename|dirname|file|stat|readlink|awk|sort|uniq|tr|cut|ps)\b|^curl\s+(?:--head|-I)\b|^sed\b(?!.*\s-i\b)/i;

/**
 * Matches commands whose first token creates/moves/links files or dirs within
 * the workspace, plus git local-mutation subcommands.
 */
const BENIGN_LOCAL_WRITE_RX =
  /^(?:touch|mkdir|cp|mv|ln|chmod|chown)\b/i;

/**
 * Matches destructive shell patterns. Not anchored — detects destructive
 * operators anywhere in the command string (pipeline, subshell, etc.) when
 * these patterns are reached AFTER the read/write checks fail.
 */
const DESTRUCTIVE_SHELL_RX =
  /\brm\b.*-[a-z]*[rf][a-z]*|\b(?:dd|mkfs|shred|shutdown|reboot|iptables|truncate|DROP)\b/i;

// ── DB SQL regexes ────────────────────────────────────────────────────────────

const READ_SQL_RX = /^\s*SELECT\b/i;
const DESTRUCTIVE_SQL_RX = /^\s*(?:DELETE|TRUNCATE|DROP)\b/i;

// ── Package-manager tool names ────────────────────────────────────────────────

const PACKAGE_MANAGER_TOOLS = new Set([
  'pip_install',
  'pip3_install',
  'npm_install',
  'npx',
  'yarn_add',
  'pnpm_add',
  'apt_install',
  'apt_get_install',
  'docker_pull',
  'brew_install',
  'cargo_add',
]);

// ── Capability-install tool names ─────────────────────────────────────────────

const CAPABILITY_INSTALL_TOOLS = new Set([
  'capability_install',
  'skill_install',
  'agent_install',
]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function newDomains(requested: string[], approved: string[]): string[] {
  return requested.filter((d) => !approved.includes(d));
}

function requiresApprovalForBand(band: BlastRadius): boolean {
  return (
    band === BlastRadius.INSTALL ||
    band === BlastRadius.STATEFUL_EXTERNAL ||
    band === BlastRadius.DESTRUCTIVE ||
    band === BlastRadius.NETWORK_EGRESS_NEW
  );
}

function makeResult(
  blastRadius: BlastRadius,
  reason: string,
  approvedDomainsDelta: string[] = [],
): ClassifierResult {
  const requiresApproval = requiresApprovalForBand(blastRadius);
  return {
    blastRadius,
    requiresApproval,
    requiresToken: requiresApproval,
    approvedDomainsDelta,
    reason,
  };
}

// ── Rule implementations ──────────────────────────────────────────────────────

function classifyShellExec(params: Record<string, unknown>): ClassifierResult {
  const command = typeof params['command'] === 'string' ? params['command'] : '';

  // Spec rule order: read → write_local → destructive → default
  if (BENIGN_READ_RX.test(command)) {
    return makeResult(BlastRadius.READ, 'Shell: read-only command pattern matched');
  }
  if (BENIGN_LOCAL_WRITE_RX.test(command)) {
    return makeResult(BlastRadius.WRITE_LOCAL, 'Shell: local-write command pattern matched');
  }
  if (DESTRUCTIVE_SHELL_RX.test(command)) {
    return makeResult(BlastRadius.DESTRUCTIVE, 'Shell: destructive command pattern matched');
  }
  return makeResult(
    BlastRadius.WRITE_LOCAL,
    'Shell: unrecognised command, defaulting to write_local (elevated inspection)',
  );
}

function classifyHttpTool(
  params: Record<string, unknown>,
  requestedNetworkDomains: string[],
  workspaceContext: { approvedDomains: string[] },
): ClassifierResult {
  const method =
    typeof params['method'] === 'string' ? params['method'].toUpperCase() : 'GET';
  const delta = newDomains(requestedNetworkDomains, workspaceContext.approvedDomains);

  if (method === 'GET' || method === 'HEAD') {
    if (delta.length > 0) {
      return makeResult(
        BlastRadius.NETWORK_EGRESS_NEW,
        'HTTP: GET/HEAD to unapproved domain',
        delta,
      );
    }
    return makeResult(BlastRadius.READ, 'HTTP: GET/HEAD to approved domain');
  }
  // POST, PUT, PATCH, DELETE → stateful external
  return makeResult(
    BlastRadius.STATEFUL_EXTERNAL,
    `HTTP: ${method} verb causes external state mutation`,
  );
}

function classifyGitTool(
  toolName: string,
  params: Record<string, unknown>,
  requestedNetworkDomains: string[],
  workspaceContext: { approvedDomains: string[] },
): ClassifierResult {
  // Derive subcommand: from toolName suffix (git_push → push) or params
  const suffix =
    toolName.includes('_') ? toolName.split('_').slice(1).join('_') : '';
  const subcommand = (
    typeof params['subcommand'] === 'string' ? params['subcommand'] : suffix
  ).toLowerCase();

  // Check force-push first (more specific than plain push)
  if (subcommand === 'push') {
    const rawCommand =
      typeof params['command'] === 'string' ? params['command'] : '';
    const argsStr = Array.isArray(params['args'])
      ? (params['args'] as unknown[]).map(String).join(' ')
      : '';
    const isForce =
      rawCommand.includes('--force') ||
      rawCommand.includes(' -f ') ||
      argsStr.includes('--force') ||
      params['force'] === true;

    if (isForce) {
      return makeResult(BlastRadius.DESTRUCTIVE, 'Git: force push is destructive');
    }

    const delta = newDomains(requestedNetworkDomains, workspaceContext.approvedDomains);
    if (delta.length > 0) {
      return makeResult(
        BlastRadius.NETWORK_EGRESS_NEW,
        `Git: push to unapproved domain`,
        delta,
      );
    }
    return makeResult(BlastRadius.STATEFUL_EXTERNAL, 'Git: push accesses remote');
  }

  if (['status', 'log', 'diff', 'show'].includes(subcommand)) {
    return makeResult(BlastRadius.READ, `Git: ${subcommand} is read-only`);
  }
  if (
    ['commit', 'add', 'checkout', 'branch', 'stash', 'merge', 'rebase', 'reset'].includes(
      subcommand,
    )
  ) {
    return makeResult(BlastRadius.WRITE_LOCAL, `Git: ${subcommand} is a local mutation`);
  }
  if (['pull', 'fetch', 'clone'].includes(subcommand)) {
    const delta = newDomains(requestedNetworkDomains, workspaceContext.approvedDomains);
    if (delta.length > 0) {
      return makeResult(
        BlastRadius.NETWORK_EGRESS_NEW,
        `Git: ${subcommand} to unapproved domain`,
        delta,
      );
    }
    return makeResult(BlastRadius.STATEFUL_EXTERNAL, `Git: ${subcommand} accesses remote`);
  }

  // Unrecognised git subcommand — fail closed
  return makeResult(
    BlastRadius.STATEFUL_EXTERNAL,
    `Git: unrecognised subcommand '${subcommand}', defaulting to stateful_external`,
  );
}

function classifyDbTool(params: Record<string, unknown>): ClassifierResult {
  const sql = typeof params['sql'] === 'string' ? params['sql'] : '';

  if (READ_SQL_RX.test(sql)) {
    return makeResult(BlastRadius.READ, 'DB: SELECT is read-only');
  }
  if (DESTRUCTIVE_SQL_RX.test(sql)) {
    return makeResult(BlastRadius.DESTRUCTIVE, 'DB: DELETE/TRUNCATE/DROP is destructive');
  }
  // INSERT, UPDATE, ALTER, CREATE → stateful_external
  return makeResult(BlastRadius.STATEFUL_EXTERNAL, 'DB: state-mutating SQL');
}

function classifyFilesystemTool(
  toolName: string,
  manifest: Record<string, unknown>,
): ClassifierResult {
  // Per-manifest hint takes precedence
  const hint =
    typeof manifest['blast_radius_hint'] === 'string' ? manifest['blast_radius_hint'] : null;
  if (hint != null) {
    const band = Object.values(BlastRadius).find((v) => v === hint);
    if (band != null) {
      return makeResult(
        band as BlastRadius,
        `Filesystem: manifest blast_radius_hint = ${hint}`,
      );
    }
  }

  // Fallback per tool name
  if (toolName === 'file_read' || toolName === 'file_list') {
    return makeResult(BlastRadius.READ, `Filesystem: ${toolName} is read-only`);
  }
  if (toolName === 'file_write' || toolName === 'file_create') {
    return makeResult(BlastRadius.WRITE_LOCAL, `Filesystem: ${toolName} is a local write`);
  }
  // file_delete, file_destroy, etc.
  return makeResult(BlastRadius.DESTRUCTIVE, `Filesystem: ${toolName} is destructive`);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Classify a tool call into one of six blast-radius bands.
 * Rules applied in spec order (docs/security/blast-radius-policy.md).
 */
export function classifyToolCall(input: ClassifierInput): ClassifierResult {
  const {
    toolName,
    params,
    manifest,
    workspaceContext,
    requestedNetworkDomains = [],
  } = input;

  let result: ClassifierResult;

  // Rule 1: Shell exec
  if (toolName === 'shell_exec') {
    result = classifyShellExec(params);
  }
  // Rule 2: HTTP tools
  else if (toolName === 'http_request' || toolName === 'http_get') {
    result = classifyHttpTool(params, requestedNetworkDomains, workspaceContext);
  }
  // Rule 3: Git tools
  else if (toolName.startsWith('git_') || toolName === 'git') {
    result = classifyGitTool(toolName, params, requestedNetworkDomains, workspaceContext);
  }
  // Rule 4: Package managers
  else if (PACKAGE_MANAGER_TOOLS.has(toolName)) {
    result = makeResult(BlastRadius.INSTALL, `Package manager: ${toolName}`);
  }
  // Rule 5: DB tools
  else if (toolName === 'db_query' || toolName === 'db_exec') {
    result = classifyDbTool(params);
  }
  // Rule 6: Filesystem tools
  else if (toolName.startsWith('file_')) {
    result = classifyFilesystemTool(toolName, manifest);
  }
  // Rule 7: Capability install tools
  else if (CAPABILITY_INSTALL_TOOLS.has(toolName)) {
    result = makeResult(BlastRadius.INSTALL, 'Capability installation');
  }
  // Rule 8: Default — fail closed
  else {
    result = makeResult(
      BlastRadius.STATEFUL_EXTERNAL,
      'No matching rule — defaulting to stateful_external (fail-closed)',
    );
  }

  // Escalation: stateful_external + new network domains → add delta to signal combined approval
  if (
    requestedNetworkDomains.length > 0 &&
    result.blastRadius === BlastRadius.STATEFUL_EXTERNAL
  ) {
    const delta = newDomains(requestedNetworkDomains, workspaceContext.approvedDomains);
    if (delta.length > 0) {
      return {
        ...result,
        approvedDomainsDelta: delta,
        reason: `${result.reason}; also touches unapproved domains: ${delta.join(', ')}`,
      };
    }
  }

  return result;
}
