# Commit & Branching Standards

See also: [../../CONTRIBUTING.md](../../CONTRIBUTING.md), [../../AGENTS.md](../../AGENTS.md).

---

## Branch Model

- `main` — always deployable
- `kairos/feature-<slug>` — all work, including Kairos's own
- No long-lived branches
- Small PRs preferred (< 400 lines changed)

## Conventional Commits

```
<type>(<scope>): <subject>

<body>

Signed-off-by: <name> <email>
Authored-by: Kairos | <agent-id> | <human>
```

### Types

- `feat` — new feature
- `fix` — bug fix
- `docs` — documentation only
- `style` — formatting, no code change
- `refactor` — code change that neither fixes a bug nor adds a feature
- `test` — adding or fixing tests
- `chore` — tooling, deps, config
- `perf` — performance improvement
- `build` — build system or external deps
- `ci` — CI config

### Scopes (common)

`control-plane`, `cognition`, `frontend`, `executor`, `vault`, `policy`, `approvals`, `memory`, `self-state`, `ego`, `models`, `docs`, `infra`, `schemas`, `events`.

### Subject

- Imperative mood: "add", not "added" or "adds"
- No period at the end
- <=72 chars

### Body

- Wrap at 72 chars
- Explain **why**, not **what**
- Reference issues: `Refs #123`, `Closes #456`

### Trailers

- `Signed-off-by` — mandatory (DCO)
- `Authored-by` — for Kairos-authored commits, records the agent id and the approving human

Example:

```
feat(policy): classify git push --force as destructive

Force pushes discard remote history and cannot be undone by Kairos.
Treat the same as rm -rf: never grant standing authorization.

Adds regression test for the classifier.

Refs #142
Signed-off-by: John Doe <john@example.com>
Authored-by: Kairos | cognition-v0.3 | approved-by:user-uuid
```

## Kairos-Authored Commits

When Kairos commits on its own (Phase 4+), the trailer records:
- The agent definition that authored
- The human who approved the change
- The approval event id

```
refactor(ego): reduce lightweight pass token budget

Observation over 2 weeks shows p95 pass uses 340 tokens.
Dropping budget to 400 leaves headroom and cuts cost ~20%.

Authored-by: Kairos | ego-v0.5 | approved-by:user-123 | approval:uuid
Signed-off-by: Jane Operator <jane@example.com>
```

## PR Requirements

- Title follows Conventional Commits format for the merge commit
- Description includes:
  - What changed
  - Why
  - Test plan
  - Deployment notes (if any)
  - Links to related ADRs / specs
- PR body includes the **Kairos attribution block** if Kairos contributed (template in PR template file)
- All CI checks pass (lint, typecheck, tests, scan)
- At least one human reviewer approval
- No merge conflicts; rebased on latest main

## Merge Strategy

- Squash-merge by default (clean history)
- Merge-commit for cross-cutting work that benefits from preserving intermediate commits
- Never rebase-merge (breaks sign-offs)

## Tagging

- Releases: `vMAJOR.MINOR.PATCH` (semver)
- Signed tags: `git tag -s`
- Release notes auto-generated from Conventional Commits

## Commit Granularity

- One logical change per commit
- Tests land with the change they test
- Migration + code that needs it land together
- Do not mix formatting changes with substantive changes

## Hooks

Local pre-commit (via `pre-commit` framework):
- Lint (eslint / ruff)
- Format (prettier / ruff format)
- Secret scan (`detect-secrets`)
- Conventional Commits lint (commitlint)

Pre-push:
- Run unit tests

Never bypass with `--no-verify` except in documented emergencies.
