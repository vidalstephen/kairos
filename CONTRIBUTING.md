# Contributing to Kairos

## Branch Model

- `main` — protected, always deployable
- `kairos/feature-DESCRIPTION` — feature work (human or Kairos-authored)
- `kairos/fix-DESCRIPTION` — bug fixes
- `kairos/refactor-DESCRIPTION` — restructure without behavior change
- `kairos/chore-DESCRIPTION` — tooling, deps, housekeeping

Branch names are lowercase, dash-separated. Kairos uses the same prefix when opening PRs from its own GitHub identity.

## Commit Style

Conventional Commits. Sign off every commit.

```
<type>(<scope>): <short summary>

<body explaining what and why, not how>

Signed-off-by: Name <email>
```

Types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `perf`, `security`.

## Pull Request Requirements

1. Branch from `main`, rebase before opening PR
2. All CI checks green: `lint`, `typecheck`, `test-unit`, `test-integration`, `scan`
3. New public surface requires a test
4. Layer 0 changes require two human reviewers and an ADR update
5. Every Kairos-authored PR carries the attribution block (see `.github/PULL_REQUEST_TEMPLATE.md`)

## Development Setup

```bash
make bootstrap    # pnpm install + uv sync + build shared packages
make up           # start Compose stack
make test         # full test suite
make doctor       # health check
```

## Coding Standards

- [TypeScript](docs/standards/typescript.md)
- [Python](docs/standards/python.md)
- [API Design](docs/standards/api-design.md)
- [Commits](docs/standards/commits.md)

## What NOT to Commit

- Plaintext credentials — ever. Use the vault. See `docs/security/credential-vault.md`.
- Generated files listed in `.gitignore`
- Large binaries without LFS
- `.env` (only `.env.example` is tracked)

## Security

Found a vulnerability? See [SECURITY.md](SECURITY.md). Do not open a public issue.

## Reporting Issues

Use the issue templates in `.github/ISSUE_TEMPLATE/`. Good issues include: reproduction steps, expected vs actual, environment, and relevant log or trace IDs.
