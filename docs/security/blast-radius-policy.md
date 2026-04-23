# Blast Radius Policy

Every tool call is classified into one of six blast radius bands. Classification is deterministic. See spec §11.1.

---

## Bands

### 1. Read

**Definition**: Read-only operations with no side effects.

**Examples**: file read, git status, container ls, HTTP GET to allowlisted domain, shell commands pattern-matched as read-only (`cat`, `ls`, `grep`, `find`, `ps`, etc.), DB SELECT.

**Policy**: Auto-approve. No UI prompt.

**Logging**: Audit event with `tier=read`.

### 2. Write Local

**Definition**: Mutations confined to the workspace filesystem or per-session state with full reversibility.

**Examples**: file write, file edit, git commit (local), session state updates, cache writes.

**Policy**: Auto-approve. Banner log entry in session transcript for user visibility. No blocking prompt.

**Logging**: Audit event with `tier=write_local` + diff summary where applicable.

### 3. Install

**Definition**: Adding a new capability to Kairos itself — new skill, new package, new agent, new tool.

**Examples**: `pip install`, `npm install`, skill creation, new agent definition, new persona.

**Policy**: Require explicit approval. Present reason, scope, reversibility. Once approved, future uses of the installed capability fall to the tool's own band (usually `write_local` or `read`).

**Logging**: Capability added to `capabilities` table with approval_id reference.

### 4. Stateful External

**Definition**: Actions that change state in external systems.

**Examples**: `git push`, API POST with side effects, creating issues/PRs, sending email, posting to webhooks.

**Policy**: Require explicit approval per-call unless a standing rule exists for the (tool, endpoint, user) tuple. Standing rules expire after 90 days or on trust signal (user navigates away, session expires, workspace changes).

**Logging**: Audit event with target + endpoint + request hash.

### 5. Destructive

**Definition**: Actions Kairos cannot undo.

**Examples**: `rm -rf`, `DROP TABLE`, force-push, API calls that delete remote resources, database truncation.

**Policy**: Always require approval. Never grant standing authorization. Ignore previous "always approve" signals. User must respond to the specific instance. Present full blast description and explicit confirmation phrase when severity is extreme.

**Logging**: Audit event with full command + target; irreversible flag.

### 6. Network Egress to New Domain

**Definition**: Outbound network access to a domain not in the workspace's approved list.

**Examples**: browsing `example.com` for the first time, API call to a new host, `curl` to an unapproved URL.

**Policy**: Require explicit approval with reason + scope (one-time vs. persistent for session vs. persistent for workspace vs. permanent). Pattern wildcards allowed (`*.github.com`) with reviewer confirmation.

**Logging**: Audit event with domain + reason + persistence scope. On approval, add to workspace egress allowlist at chosen scope.

---

## Classification Inputs

The classifier receives:

```
{
  tool_id,
  tool_name,
  tool_version,
  params,              // post-validation, pre-execution
  manifest,            // from tool_registry
  workspace_context,
  requested_network_domains  // enumerated before call
}
```

And computes:

```
{
  blast_radius,        // one of the six bands
  requires_approval,   // boolean
  requires_token,      // always true at Phase 2+
  approved_domains_delta,  // new domains needing approval
  reason               // human-readable classification explanation
}
```

---

## Classification Rules (deterministic, in order)

1. **Shell exec**: inspect the command. Match against:
   - `BENIGN_READ_RX` (cat, ls, grep, find, head, tail, wc, echo, pwd, which, env, date, basename, dirname, file, stat, readlink, awk, sed without -i, sort, uniq, tr, cut, curl --head) → `read`
   - `BENIGN_LOCAL_WRITE_RX` (touch, mkdir, cp, mv, ln, chmod, chown inside workspace, git commit/add without push) → `write_local`
   - `DESTRUCTIVE_RX` (rm -rf, dd, mkfs, shred, shutdown, reboot, iptables, truncate, DROP) → `destructive`
   - default → `write_local` with elevated inspection

2. **HTTP tools**: check verb + URL domain against `workspace.approved_domains`:
   - GET, HEAD + allowlisted → `read`
   - GET, HEAD + new domain → `network_egress_new`
   - POST, PUT, PATCH, DELETE → `stateful_external`

3. **Git tools**: inspect subcommand:
   - `status`, `log`, `diff`, `show` → `read`
   - `commit`, `add`, `checkout`, `branch` → `write_local`
   - `push`, `pull`, `fetch`, `clone` → `stateful_external` (+ network check)
   - `push --force` → `destructive`

4. **Package managers**: `pip install`, `npm install`, `apt install`, `docker pull` → `install`

5. **DB tools**: inspect SQL:
   - SELECT → `read`
   - INSERT, UPDATE with WHERE → `stateful_external`
   - DELETE, TRUNCATE, DROP → `destructive`
   - ALTER, CREATE → `stateful_external`

6. **Filesystem tools**: per-tool mapping in manifest (read/write/destroy).

7. **Capability install tools**: always `install`.

8. **Default**: when no rule applies, default to `stateful_external` (fail-closed).

---

## Escalation Rules

- If a call would touch both `destructive` and `stateful_external`, use `destructive`.
- If it touches a new domain and is a state-changing verb, both approvals required (combined into one approval UI, both must be granted).
- Parameter substitution that changes class mid-execution → re-classify, block if escalation crosses the approval line.

---

## Standing Authorization

Approved on creation:
- Workspace × tool × target pattern (e.g., `git push origin kairos/feature-*`)
- Expires at 90 days or on trust signal
- User revocable via `/approvals/standing-rules` (Phase 5 UI)

---

## Testing

Every rule has at least one positive and one negative unit test. Property-based tests (QuickCheck-style) explore parameter variations. Integration tests simulate full run → classify → approval → execute flow.

Test file: `services/control-plane/src/modules/policy/__tests__/classifier.spec.ts` (Phase 2+).

---

## Updating Rules

Changes to classification are Layer 1 (gate-protected). Kairos can propose; humans approve. Each change lands as a migration + updated test suite + ADR if behavior semantics change.
