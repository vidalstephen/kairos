/**
 * Blast-radius classifier — 100% branch coverage.
 *
 * Every rule branch from docs/security/blast-radius-policy.md is exercised:
 *  Rule 1: shell_exec  (4 branches: read / write_local / destructive / default)
 *  Rule 2: http_request (3 branches: read / network_egress_new / stateful_external)
 *  Rule 3: git_*        (6 branches: read / write_local / destructive / stateful_external / network_egress_new / unknown)
 *  Rule 4: package managers → install
 *  Rule 5: db_query     (3 branches: read / destructive / stateful_external)
 *  Rule 6: file_*       (4 sub-branches: file_read, file_write, file_delete, manifest hint)
 *  Rule 7: capability_install → install
 *  Rule 8: default      → stateful_external
 *  Escalation: stateful_external + new domain → adds approvedDomainsDelta
 *  requiresApproval: all six bands tested
 */

import { describe, expect, it } from 'vitest';
import { BlastRadius } from '../../../database/enums.js';
import { classifyToolCall } from '../blast-radius-classifier.js';
import type { ClassifierInput } from '../blast-radius-classifier.js';

// ── Factory ───────────────────────────────────────────────────────────────────

function makeInput(overrides: Partial<ClassifierInput> = {}): ClassifierInput {
  return {
    toolName: 'unknown_tool',
    params: {},
    manifest: {},
    workspaceContext: { approvedDomains: ['github.com'] },
    requestedNetworkDomains: [],
    ...overrides,
  };
}

// ── Rule 1: shell_exec ────────────────────────────────────────────────────────

describe('shell_exec', () => {
  it('classifies cat as READ', () => {
    const result = classifyToolCall(
      makeInput({ toolName: 'shell_exec', params: { command: 'cat /etc/hosts' } }),
    );
    expect(result.blastRadius).toBe(BlastRadius.READ);
    expect(result.requiresApproval).toBe(false);
    expect(result.requiresToken).toBe(false);
  });

  it('classifies grep as READ', () => {
    const result = classifyToolCall(
      makeInput({ toolName: 'shell_exec', params: { command: 'grep -r foo src/' } }),
    );
    expect(result.blastRadius).toBe(BlastRadius.READ);
  });

  it('classifies ls as READ', () => {
    const result = classifyToolCall(
      makeInput({ toolName: 'shell_exec', params: { command: 'ls -la /tmp' } }),
    );
    expect(result.blastRadius).toBe(BlastRadius.READ);
  });

  it('classifies curl --head as READ', () => {
    const result = classifyToolCall(
      makeInput({
        toolName: 'shell_exec',
        params: { command: 'curl --head https://example.com' },
      }),
    );
    expect(result.blastRadius).toBe(BlastRadius.READ);
  });

  it('classifies sed without -i as READ', () => {
    const result = classifyToolCall(
      makeInput({
        toolName: 'shell_exec',
        params: { command: "sed 's/foo/bar/' file.txt" },
      }),
    );
    expect(result.blastRadius).toBe(BlastRadius.READ);
  });

  it('classifies touch as WRITE_LOCAL', () => {
    const result = classifyToolCall(
      makeInput({ toolName: 'shell_exec', params: { command: 'touch newfile.txt' } }),
    );
    expect(result.blastRadius).toBe(BlastRadius.WRITE_LOCAL);
    expect(result.requiresApproval).toBe(false);
  });

  it('classifies mkdir as WRITE_LOCAL', () => {
    const result = classifyToolCall(
      makeInput({ toolName: 'shell_exec', params: { command: 'mkdir -p dist/output' } }),
    );
    expect(result.blastRadius).toBe(BlastRadius.WRITE_LOCAL);
  });

  it('classifies rm -rf as DESTRUCTIVE', () => {
    const result = classifyToolCall(
      makeInput({ toolName: 'shell_exec', params: { command: 'rm -rf /tmp/work' } }),
    );
    expect(result.blastRadius).toBe(BlastRadius.DESTRUCTIVE);
    expect(result.requiresApproval).toBe(true);
    expect(result.requiresToken).toBe(true);
  });

  it('classifies shutdown as DESTRUCTIVE', () => {
    const result = classifyToolCall(
      makeInput({ toolName: 'shell_exec', params: { command: 'shutdown -h now' } }),
    );
    expect(result.blastRadius).toBe(BlastRadius.DESTRUCTIVE);
  });

  it('classifies dd as DESTRUCTIVE', () => {
    const result = classifyToolCall(
      makeInput({
        toolName: 'shell_exec',
        params: { command: 'dd if=/dev/zero of=/dev/sda' },
      }),
    );
    expect(result.blastRadius).toBe(BlastRadius.DESTRUCTIVE);
  });

  it('defaults unknown command to WRITE_LOCAL', () => {
    const result = classifyToolCall(
      makeInput({ toolName: 'shell_exec', params: { command: 'python3 script.py' } }),
    );
    expect(result.blastRadius).toBe(BlastRadius.WRITE_LOCAL);
    expect(result.reason).toMatch(/elevated inspection/);
  });

  it('defaults when command param is missing to WRITE_LOCAL', () => {
    const result = classifyToolCall(makeInput({ toolName: 'shell_exec', params: {} }));
    expect(result.blastRadius).toBe(BlastRadius.WRITE_LOCAL);
  });
});

// ── Rule 2: http_request ──────────────────────────────────────────────────────

describe('http_request', () => {
  it('classifies GET to approved domain as READ', () => {
    const result = classifyToolCall(
      makeInput({
        toolName: 'http_request',
        params: { method: 'GET', url: 'https://github.com/foo' },
        workspaceContext: { approvedDomains: ['github.com'] },
        requestedNetworkDomains: ['github.com'],
      }),
    );
    expect(result.blastRadius).toBe(BlastRadius.READ);
    expect(result.approvedDomainsDelta).toHaveLength(0);
  });

  it('classifies HEAD to approved domain as READ', () => {
    const result = classifyToolCall(
      makeInput({
        toolName: 'http_request',
        params: { method: 'HEAD', url: 'https://github.com' },
        workspaceContext: { approvedDomains: ['github.com'] },
        requestedNetworkDomains: ['github.com'],
      }),
    );
    expect(result.blastRadius).toBe(BlastRadius.READ);
  });

  it('classifies GET to unapproved domain as NETWORK_EGRESS_NEW', () => {
    const result = classifyToolCall(
      makeInput({
        toolName: 'http_request',
        params: { method: 'GET' },
        workspaceContext: { approvedDomains: [] },
        requestedNetworkDomains: ['evil.example.com'],
      }),
    );
    expect(result.blastRadius).toBe(BlastRadius.NETWORK_EGRESS_NEW);
    expect(result.requiresApproval).toBe(true);
    expect(result.approvedDomainsDelta).toContain('evil.example.com');
  });

  it('classifies POST as STATEFUL_EXTERNAL', () => {
    const result = classifyToolCall(
      makeInput({
        toolName: 'http_request',
        params: { method: 'POST' },
        workspaceContext: { approvedDomains: ['api.example.com'] },
        requestedNetworkDomains: ['api.example.com'],
      }),
    );
    expect(result.blastRadius).toBe(BlastRadius.STATEFUL_EXTERNAL);
    expect(result.requiresApproval).toBe(true);
  });

  it('classifies DELETE as STATEFUL_EXTERNAL', () => {
    const result = classifyToolCall(
      makeInput({
        toolName: 'http_request',
        params: { method: 'DELETE' },
      }),
    );
    expect(result.blastRadius).toBe(BlastRadius.STATEFUL_EXTERNAL);
  });

  it('defaults missing method to GET treatment', () => {
    const result = classifyToolCall(
      makeInput({
        toolName: 'http_get',
        params: {},
        workspaceContext: { approvedDomains: [] },
        requestedNetworkDomains: [],
      }),
    );
    expect(result.blastRadius).toBe(BlastRadius.READ);
  });
});

// ── Rule 3: git_* ─────────────────────────────────────────────────────────────

describe('git tools', () => {
  it('classifies git_status as READ', () => {
    const result = classifyToolCall(makeInput({ toolName: 'git_status', params: {} }));
    expect(result.blastRadius).toBe(BlastRadius.READ);
  });

  it('classifies git_log as READ', () => {
    const result = classifyToolCall(makeInput({ toolName: 'git_log', params: {} }));
    expect(result.blastRadius).toBe(BlastRadius.READ);
  });

  it('classifies git_diff as READ', () => {
    const result = classifyToolCall(makeInput({ toolName: 'git_diff', params: {} }));
    expect(result.blastRadius).toBe(BlastRadius.READ);
  });

  it('classifies git_show as READ', () => {
    const result = classifyToolCall(makeInput({ toolName: 'git_show', params: {} }));
    expect(result.blastRadius).toBe(BlastRadius.READ);
  });

  it('classifies git_commit as WRITE_LOCAL', () => {
    const result = classifyToolCall(makeInput({ toolName: 'git_commit', params: {} }));
    expect(result.blastRadius).toBe(BlastRadius.WRITE_LOCAL);
  });

  it('classifies git_add as WRITE_LOCAL', () => {
    const result = classifyToolCall(makeInput({ toolName: 'git_add', params: {} }));
    expect(result.blastRadius).toBe(BlastRadius.WRITE_LOCAL);
  });

  it('classifies git_checkout as WRITE_LOCAL', () => {
    const result = classifyToolCall(makeInput({ toolName: 'git_checkout', params: {} }));
    expect(result.blastRadius).toBe(BlastRadius.WRITE_LOCAL);
  });

  it('classifies git_push with --force as DESTRUCTIVE', () => {
    const result = classifyToolCall(
      makeInput({
        toolName: 'git_push',
        params: { command: 'git push --force origin main' },
      }),
    );
    expect(result.blastRadius).toBe(BlastRadius.DESTRUCTIVE);
    expect(result.requiresApproval).toBe(true);
  });

  it('classifies git_push with force=true as DESTRUCTIVE', () => {
    const result = classifyToolCall(makeInput({ toolName: 'git_push', params: { force: true } }));
    expect(result.blastRadius).toBe(BlastRadius.DESTRUCTIVE);
  });

  it('classifies git_push (no force, approved domain) as STATEFUL_EXTERNAL', () => {
    const result = classifyToolCall(
      makeInput({
        toolName: 'git_push',
        params: {},
        workspaceContext: { approvedDomains: ['github.com'] },
        requestedNetworkDomains: ['github.com'],
      }),
    );
    expect(result.blastRadius).toBe(BlastRadius.STATEFUL_EXTERNAL);
  });

  it('classifies git_push to unapproved domain as NETWORK_EGRESS_NEW', () => {
    const result = classifyToolCall(
      makeInput({
        toolName: 'git_push',
        params: {},
        workspaceContext: { approvedDomains: [] },
        requestedNetworkDomains: ['new-remote.example.com'],
      }),
    );
    expect(result.blastRadius).toBe(BlastRadius.NETWORK_EGRESS_NEW);
    expect(result.approvedDomainsDelta).toContain('new-remote.example.com');
  });

  it('classifies git_pull (approved domain) as STATEFUL_EXTERNAL', () => {
    const result = classifyToolCall(
      makeInput({
        toolName: 'git_pull',
        params: {},
        workspaceContext: { approvedDomains: ['github.com'] },
        requestedNetworkDomains: ['github.com'],
      }),
    );
    expect(result.blastRadius).toBe(BlastRadius.STATEFUL_EXTERNAL);
  });

  it('classifies git_fetch to unapproved domain as NETWORK_EGRESS_NEW', () => {
    const result = classifyToolCall(
      makeInput({
        toolName: 'git_fetch',
        params: {},
        workspaceContext: { approvedDomains: [] },
        requestedNetworkDomains: ['gitlab.example.com'],
      }),
    );
    expect(result.blastRadius).toBe(BlastRadius.NETWORK_EGRESS_NEW);
  });

  it('classifies git_clone (approved domain) as STATEFUL_EXTERNAL', () => {
    const result = classifyToolCall(
      makeInput({
        toolName: 'git_clone',
        params: {},
        workspaceContext: { approvedDomains: ['github.com'] },
        requestedNetworkDomains: ['github.com'],
      }),
    );
    expect(result.blastRadius).toBe(BlastRadius.STATEFUL_EXTERNAL);
  });

  it('classifies unrecognised git subcommand as STATEFUL_EXTERNAL', () => {
    const result = classifyToolCall(makeInput({ toolName: 'git_obliterate', params: {} }));
    expect(result.blastRadius).toBe(BlastRadius.STATEFUL_EXTERNAL);
    expect(result.reason).toMatch(/unrecognised subcommand/);
  });

  it('uses params.subcommand when toolName is bare "git"', () => {
    const result = classifyToolCall(
      makeInput({ toolName: 'git', params: { subcommand: 'status' } }),
    );
    expect(result.blastRadius).toBe(BlastRadius.READ);
  });
});

// ── Rule 4: package managers ──────────────────────────────────────────────────

describe('package managers', () => {
  it('classifies pip_install as INSTALL', () => {
    const result = classifyToolCall(makeInput({ toolName: 'pip_install', params: {} }));
    expect(result.blastRadius).toBe(BlastRadius.INSTALL);
    expect(result.requiresApproval).toBe(true);
  });

  it('classifies npm_install as INSTALL', () => {
    const result = classifyToolCall(makeInput({ toolName: 'npm_install', params: {} }));
    expect(result.blastRadius).toBe(BlastRadius.INSTALL);
  });

  it('classifies docker_pull as INSTALL', () => {
    const result = classifyToolCall(makeInput({ toolName: 'docker_pull', params: {} }));
    expect(result.blastRadius).toBe(BlastRadius.INSTALL);
  });
});

// ── Rule 5: db_query ──────────────────────────────────────────────────────────

describe('db_query', () => {
  it('classifies SELECT as READ', () => {
    const result = classifyToolCall(
      makeInput({ toolName: 'db_query', params: { sql: 'SELECT * FROM users' } }),
    );
    expect(result.blastRadius).toBe(BlastRadius.READ);
    expect(result.requiresApproval).toBe(false);
  });

  it('classifies DELETE as DESTRUCTIVE', () => {
    const result = classifyToolCall(
      makeInput({
        toolName: 'db_query',
        params: { sql: 'DELETE FROM sessions WHERE user_id = $1' },
      }),
    );
    expect(result.blastRadius).toBe(BlastRadius.DESTRUCTIVE);
    expect(result.requiresApproval).toBe(true);
  });

  it('classifies TRUNCATE as DESTRUCTIVE', () => {
    const result = classifyToolCall(
      makeInput({ toolName: 'db_query', params: { sql: 'TRUNCATE TABLE spans' } }),
    );
    expect(result.blastRadius).toBe(BlastRadius.DESTRUCTIVE);
  });

  it('classifies DROP as DESTRUCTIVE', () => {
    const result = classifyToolCall(
      makeInput({ toolName: 'db_query', params: { sql: 'DROP TABLE old_data' } }),
    );
    expect(result.blastRadius).toBe(BlastRadius.DESTRUCTIVE);
  });

  it('classifies INSERT as STATEFUL_EXTERNAL', () => {
    const result = classifyToolCall(
      makeInput({
        toolName: 'db_query',
        params: { sql: 'INSERT INTO messages (id, content) VALUES ($1, $2)' },
      }),
    );
    expect(result.blastRadius).toBe(BlastRadius.STATEFUL_EXTERNAL);
  });

  it('classifies UPDATE as STATEFUL_EXTERNAL', () => {
    const result = classifyToolCall(
      makeInput({
        toolName: 'db_query',
        params: { sql: 'UPDATE users SET role = $1 WHERE id = $2' },
      }),
    );
    expect(result.blastRadius).toBe(BlastRadius.STATEFUL_EXTERNAL);
  });

  it('classifies ALTER as STATEFUL_EXTERNAL', () => {
    const result = classifyToolCall(
      makeInput({ toolName: 'db_exec', params: { sql: 'ALTER TABLE foo ADD COLUMN bar TEXT' } }),
    );
    expect(result.blastRadius).toBe(BlastRadius.STATEFUL_EXTERNAL);
  });

  it('defaults missing sql to STATEFUL_EXTERNAL', () => {
    const result = classifyToolCall(makeInput({ toolName: 'db_query', params: {} }));
    expect(result.blastRadius).toBe(BlastRadius.STATEFUL_EXTERNAL);
  });
});

// ── Rule 6: filesystem tools ──────────────────────────────────────────────────

describe('filesystem tools', () => {
  it('classifies file_read as READ', () => {
    const result = classifyToolCall(makeInput({ toolName: 'file_read', params: {} }));
    expect(result.blastRadius).toBe(BlastRadius.READ);
  });

  it('classifies file_list as READ', () => {
    const result = classifyToolCall(makeInput({ toolName: 'file_list', params: {} }));
    expect(result.blastRadius).toBe(BlastRadius.READ);
  });

  it('classifies file_write as WRITE_LOCAL', () => {
    const result = classifyToolCall(makeInput({ toolName: 'file_write', params: {} }));
    expect(result.blastRadius).toBe(BlastRadius.WRITE_LOCAL);
  });

  it('classifies file_create as WRITE_LOCAL', () => {
    const result = classifyToolCall(makeInput({ toolName: 'file_create', params: {} }));
    expect(result.blastRadius).toBe(BlastRadius.WRITE_LOCAL);
  });

  it('classifies file_delete as DESTRUCTIVE', () => {
    const result = classifyToolCall(makeInput({ toolName: 'file_delete', params: {} }));
    expect(result.blastRadius).toBe(BlastRadius.DESTRUCTIVE);
  });

  it('classifies file_destroy as DESTRUCTIVE', () => {
    const result = classifyToolCall(makeInput({ toolName: 'file_destroy', params: {} }));
    expect(result.blastRadius).toBe(BlastRadius.DESTRUCTIVE);
  });

  it('uses manifest blast_radius_hint when provided', () => {
    const result = classifyToolCall(
      makeInput({
        toolName: 'file_unknown',
        manifest: { blast_radius_hint: 'write_local' },
      }),
    );
    expect(result.blastRadius).toBe(BlastRadius.WRITE_LOCAL);
    expect(result.reason).toMatch(/manifest blast_radius_hint/);
  });

  it('ignores invalid manifest hint and falls back to tool name', () => {
    const result = classifyToolCall(
      makeInput({
        toolName: 'file_read',
        manifest: { blast_radius_hint: 'not_a_valid_band' },
      }),
    );
    // Invalid hint ignored → fallback: file_read → READ
    expect(result.blastRadius).toBe(BlastRadius.READ);
  });
});

// ── Rule 7: capability install tools ─────────────────────────────────────────

describe('capability install tools', () => {
  it('classifies capability_install as INSTALL', () => {
    const result = classifyToolCall(makeInput({ toolName: 'capability_install', params: {} }));
    expect(result.blastRadius).toBe(BlastRadius.INSTALL);
    expect(result.requiresApproval).toBe(true);
  });

  it('classifies skill_install as INSTALL', () => {
    const result = classifyToolCall(makeInput({ toolName: 'skill_install', params: {} }));
    expect(result.blastRadius).toBe(BlastRadius.INSTALL);
  });

  it('classifies agent_install as INSTALL', () => {
    const result = classifyToolCall(makeInput({ toolName: 'agent_install', params: {} }));
    expect(result.blastRadius).toBe(BlastRadius.INSTALL);
  });
});

// ── Rule 8: default (fail-closed) ────────────────────────────────────────────

describe('default rule', () => {
  it('classifies unknown tool as STATEFUL_EXTERNAL', () => {
    const result = classifyToolCall(
      makeInput({ toolName: 'some_totally_unknown_tool_xyz', params: {} }),
    );
    expect(result.blastRadius).toBe(BlastRadius.STATEFUL_EXTERNAL);
    expect(result.requiresApproval).toBe(true);
    expect(result.reason).toMatch(/fail-closed/);
  });
});

// ── Escalation rules ──────────────────────────────────────────────────────────

describe('escalation', () => {
  it('adds approvedDomainsDelta when stateful_external call touches new domain', () => {
    const result = classifyToolCall(
      makeInput({
        toolName: 'some_unknown_tool',
        params: {},
        workspaceContext: { approvedDomains: [] },
        requestedNetworkDomains: ['new.example.com'],
      }),
    );
    // Default rule → STATEFUL_EXTERNAL + new domain escalation
    expect(result.blastRadius).toBe(BlastRadius.STATEFUL_EXTERNAL);
    expect(result.approvedDomainsDelta).toContain('new.example.com');
    expect(result.reason).toMatch(/unapproved domains/);
  });

  it('does not add delta when network domain is already approved', () => {
    const result = classifyToolCall(
      makeInput({
        toolName: 'some_unknown_tool',
        params: {},
        workspaceContext: { approvedDomains: ['trusted.example.com'] },
        requestedNetworkDomains: ['trusted.example.com'],
      }),
    );
    expect(result.approvedDomainsDelta).toHaveLength(0);
  });
});

// ── requiresApproval per band ─────────────────────────────────────────────────

describe('requiresApproval matrix', () => {
  it('READ → requiresApproval=false, requiresToken=false', () => {
    const r = classifyToolCall(makeInput({ toolName: 'file_read', params: {} }));
    expect(r.requiresApproval).toBe(false);
    expect(r.requiresToken).toBe(false);
  });

  it('WRITE_LOCAL → requiresApproval=false, requiresToken=false', () => {
    const r = classifyToolCall(makeInput({ toolName: 'file_write', params: {} }));
    expect(r.requiresApproval).toBe(false);
    expect(r.requiresToken).toBe(false);
  });

  it('INSTALL → requiresApproval=true, requiresToken=true', () => {
    const r = classifyToolCall(makeInput({ toolName: 'pip_install', params: {} }));
    expect(r.requiresApproval).toBe(true);
    expect(r.requiresToken).toBe(true);
  });

  it('STATEFUL_EXTERNAL → requiresApproval=true, requiresToken=true', () => {
    const r = classifyToolCall(makeInput({ toolName: 'unknown_tool', params: {} }));
    expect(r.requiresApproval).toBe(true);
    expect(r.requiresToken).toBe(true);
  });

  it('DESTRUCTIVE → requiresApproval=true, requiresToken=true', () => {
    const r = classifyToolCall(
      makeInput({ toolName: 'shell_exec', params: { command: 'rm -rf /var' } }),
    );
    expect(r.requiresApproval).toBe(true);
    expect(r.requiresToken).toBe(true);
  });

  it('NETWORK_EGRESS_NEW → requiresApproval=true, requiresToken=true', () => {
    const r = classifyToolCall(
      makeInput({
        toolName: 'http_request',
        params: { method: 'GET' },
        workspaceContext: { approvedDomains: [] },
        requestedNetworkDomains: ['new.site.com'],
      }),
    );
    expect(r.requiresApproval).toBe(true);
    expect(r.requiresToken).toBe(true);
  });
});
