# Cognition

Python 3.12 service. Runs the Ego loop, stratum workers, model calls, sanitization. Has no direct DB write path beyond audit events via the control plane.

See [../../docs/specs/ego-runtime.md](../../docs/specs/ego-runtime.md).

## Dev

```bash
uv sync
uv run python -m kairos_cognition.main
uv run pytest
uv run ruff check .
uv run mypy src/
```

## Phase 0

Only boots, exposes `GET /health`, logs startup. Ego loop and provider adapters land in Phase 1.
